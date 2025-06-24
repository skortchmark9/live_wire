import aiohttp
import sys
from pathlib import Path
from user import auth_manager
from weather import update_weather_data, get_stored_weather_data
import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Optional, List, Dict
import logging
from fastapi import FastAPI, HTTPException, Query, Response, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn
from opower import exceptions as opower_exceptions
from opower import Opower
from data_collectors.electricity_collector import collect_electricity_data, get_demo_api, get_user_api
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

async def periodic_weather_update():
    """Periodically update weather data"""
    while True:
        sleep_time_hours = await update_weather_data()
        await asyncio.sleep(sleep_time_hours * 3600)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app lifecycle - startup and shutdown"""
    # Startup
    logger.info("Starting Live Wire API...")
    # Start background task for periodic weather updates
    task = asyncio.create_task(periodic_weather_update())
    
    yield
    
    # Shutdown
    logger.info("Shutting down Live Wire API...")
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(title="Live Wire API", version="1.0.0", lifespan=lifespan)

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware - environment-based configuration
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
logger.info(f"Allowed CORS origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Cookie"],
)




# Request models
class LoginRequest(BaseModel):
    username: str
    password: str

class MFARequest(BaseModel):
    session_id: str
    mfa_code: str




@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.get("/api/weather-data")
async def get_weather_data():
    result = get_stored_weather_data()
    return result

@app.get("/api/predictions")
async def get_predictions(limit: Optional[int] = Query(None)):
    """Get ML model predictions"""
    # TODO: Implement predictions endpoint with proper data source
    raise HTTPException(status_code=501, detail="Predictions endpoint not yet implemented")

@app.post("/api/auth/demo")
@limiter.limit("5/minute")
async def demo_login(request: Request, response: Response):
    """Login with demo credentials - no session required"""
    logger.info("Demo login initiated")
    
    # Verify demo credentials are configured
    demo_username = os.getenv("DEMO_CONED_USERNAME")
    demo_password = os.getenv("DEMO_CONED_PASSWORD")
    
    if not demo_username or not demo_password:
        raise HTTPException(status_code=500, detail="Demo mode not configured")
    
    # Set demo mode cookie
    cookie_domain = os.getenv("COOKIE_DOMAIN")
    is_production = cookie_domain is not None
    
    logger.info(f"Setting demo cookie - Production: {is_production}, Domain: {cookie_domain}")
    
    response.set_cookie(
        key="demo_mode", 
        value="true",
        domain=cookie_domain,
        secure=is_production,
        samesite="none" if is_production else "lax",
        max_age=7200  # 2 hours
    )
    
    return {
        "status": "success",
        "message": "Demo mode activated",
        "demo_mode": True
    }

@app.post("/api/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, login_request: LoginRequest, response: Response):
    """Initiate login flow and return session ID for MFA"""
    logger.info(f"Login attempt for user: {login_request.username}")
    session_id = await auth_manager.create_session(login_request.username, login_request.password)
    
    # Set session cookie with the session_id
    # Use environment variable for cookie domain (None for localhost, .railway.app for production)
    cookie_domain = os.getenv("COOKIE_DOMAIN")  # None for localhost, ".railway.app" for production
    is_production = cookie_domain is not None
    
    logger.info(f"Setting cookie - Production: {is_production}, Domain: {cookie_domain}")
    response.delete_cookie("demo_mode")  # Clear demo mode cookie if it exists
    response.set_cookie(
        key="user_session", 
        value=session_id,
        domain=cookie_domain,  # None for localhost, cross-domain for production
        secure=is_production,  # False for localhost HTTP, True for production HTTPS
        samesite="none" if is_production else "lax",  # none for cross-domain, lax for localhost
        max_age=7200  # 2 hours
    )
    
    # Start authentication in background
    asyncio.create_task(auth_manager.authenticate_with_collector(session_id))
    
    return {
        "session_id": session_id,
        "status": "authenticating",
        "message": "Please provide your MFA code"
    }

@app.post("/api/auth/mfa")
@limiter.limit("10/minute")
async def submit_mfa(request: Request, mfa_request: MFARequest):
    """Submit MFA code for a pending session"""
    success = await auth_manager.submit_mfa(mfa_request.session_id, mfa_request.mfa_code)
    if not success:
        raise HTTPException(status_code=400, detail="Session not found or expired")
    
    return {
        "session_id": mfa_request.session_id,
        "status": "processing",
        "message": "MFA code received, authenticating..."
    }

@app.get("/api/auth/status/{session_id}")
async def get_auth_status(session_id: str):
    """Check the status of an authentication session"""
    session = auth_manager.get_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    
    return {
        "session_id": session_id,
        "status": session["status"],
        "error": session.get("error"),
        "created_at": session["created_at"].isoformat()
    }

@app.get("/api/electricity-data")
async def get_electricity_data_combined(
    request: Request,
):
    """Get combined electricity usage and forecast data in a single request"""
    session_id = request.cookies.get("user_session")
    is_demo = request.cookies.get("demo_mode") == "true"

    if not session_id and not is_demo:
        raise HTTPException(status_code=401, detail="Authentication required. Please login first.")
    
    get_api_ctx = get_demo_api
    
    if not is_demo:
        # Get the session
        session = auth_manager.get_session(session_id)
        if not session or session["status"] != "success":
            raise HTTPException(status_code=401, detail="Session expired. Please login again.")
        if not session.get('access_token'):
            raise HTTPException(status_code=401, detail="No access token.")
        
        get_api_ctx = lambda: get_user_api(session['username'], session['password'], session['access_token'])

    # Use the context manager to get API instance
    try:
        async with get_api_ctx() as api:
            result = await collect_electricity_data(api)
    except opower_exceptions.ApiException as e:
        raise HTTPException(status_code=e.status, detail=f"Failed to collect electricity data: {str(e)}")
    
    if not result:
        raise HTTPException(status_code=500, detail="Failed to collect electricity data")
    
    usage_data = result.get('usage_data', [])
    forecast_data = result.get('forecast_data', [])
    
    return {
        "metadata": result.get('metadata', {}),
        "usage_data": usage_data,
        "usage_count": len(usage_data),
        "forecast_data": forecast_data,
        "forecast_count": len(forecast_data)
    }


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)