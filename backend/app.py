from cachetools import TTLCache
import asyncio
from user import auth_manager
from weather import update_weather_data, get_stored_weather_data
import asyncio
import os
from datetime import datetime
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
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env.local in development
if os.getenv('RAILWAY_ENVIRONMENT_NAME') != 'production':
    env_path = Path(__file__).parent.parent / '.env.local'
    if env_path.exists():
        load_dotenv(env_path)
        logger.info(f"Loaded environment variables from {env_path}")
    else:
        # Try .env as fallback
        load_dotenv()
        logger.info("Loaded environment variables from .env")

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

# Thread-safe TTL cache for demo data (15 minute TTL, max 1 item)
demo_cache = TTLCache(maxsize=1, ttl=900)  # 15 minutes = 900 seconds

async def get_cached_demo_data():
    """Get demo data with caching"""
    cache_key = "demo_data"
    
    if cache_key in demo_cache:
        logger.info("Returning cached demo data")
        return demo_cache[cache_key]
    
    logger.info("Cache miss - fetching fresh demo data from ConEd")
    async with get_demo_api() as api:
        result = await collect_electricity_data(api)
    
    if result:
        demo_cache[cache_key] = result
        logger.info("Demo data cached for 15 minutes")
    
    return result

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
raw_origins = os.getenv("ALLOWED_ORIGINS", "localhost:3000,127.0.0.1:3000").split(",")
allowed_origins = []
cookie_domains = []

for origin in raw_origins:
    origin = origin.strip()
    if origin.startswith("localhost") or "127.0.0.1" in origin:
        allowed_origins.append(f"http://{origin}")
    else:
        allowed_origins.append(f"https://{origin}")
        cookie_domains.append(origin)

# Store cookie domains for request-based selection
configured_domains = cookie_domains

def get_cookie_domain_for_request(request: Request) -> Optional[str]:
    """Get appropriate cookie domain based on request host and configured domains"""
    host = request.headers.get("host", "")
    
    for domain in configured_domains:
        if domain in host:
            return f".{'.'.join(domain.split('.')[-2:])}"  # Get root domain (e.g. .tracy.ac, .railway.app)
    
    return None  # Default to None for localhost or unmatched domains

logger.info(f"Allowed CORS origins: {allowed_origins}")
logger.info(f"Cookie domain: {','.join(cookie_domains)}")

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
        logger.exception("Demo mode not configured")
        raise HTTPException(status_code=500, detail="Demo mode not configured")
    
    # Set demo mode cookie  
    request_cookie_domain = get_cookie_domain_for_request(request)
    is_production = request_cookie_domain is not None
    
    logger.info(f"Setting demo cookie - Production: {is_production}, Domain: {request_cookie_domain}")
    
    response.set_cookie(
        key="demo_mode", 
        value="true",
        domain=request_cookie_domain,
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
    # Use derived cookie domain (None for localhost, domains for production)
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
    
    if is_demo:
        # Use cached demo data
        try:
            result = await get_cached_demo_data()
        except opower_exceptions.ApiException as e:
            raise HTTPException(status_code=e.status, detail=f"Failed to collect demo electricity data: {str(e)}")
    else:
        # Regular user flow
        session = auth_manager.get_session(session_id)
        if not session or session["status"] != "success":
            raise HTTPException(status_code=401, detail="Session expired. Please login again.")
        if not session.get('access_token'):
            raise HTTPException(status_code=401, detail="No access token.")
        
        try:
            async with get_user_api(session['username'], session['password'], session['access_token']) as api:
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
    uvicorn.run("app:app", host="0.0.0.0", port=5050, reload=True)