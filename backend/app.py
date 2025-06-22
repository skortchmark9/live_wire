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
from opower import Opower
from data_collectors.electricity_collector import collect_electricity_data
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
async def get_weather_data(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: Optional[int] = Query(None),
):
    result = get_stored_weather_data()
    return result

@app.get("/api/predictions")
async def get_predictions(limit: Optional[int] = Query(None)):
    """Get ML model predictions"""
    # TODO: Implement predictions endpoint with proper data source
    raise HTTPException(status_code=501, detail="Predictions endpoint not yet implemented")

@app.post("/api/auth/login")
async def login(request: LoginRequest, response: Response):
    """Initiate login flow and return session ID for MFA"""
    logger.info(f"Login attempt for user: {request.username}")
    session_id = await auth_manager.create_session(request.username, request.password)
    
    # Set session cookie with the session_id
    response.set_cookie(
        key="user_session", 
        value=session_id,
        secure=True,  # Set to True in production with HTTPS
        samesite="lax",
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
async def submit_mfa(request: MFARequest):
    """Submit MFA code for a pending session"""
    success = await auth_manager.submit_mfa(request.session_id, request.mfa_code)
    if not success:
        raise HTTPException(status_code=400, detail="Session not found or expired")
    
    return {
        "session_id": request.session_id,
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
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: Optional[int] = Query(None)
):
    """Get combined electricity usage and forecast data in a single request"""
    session_id = request.cookies.get("user_session")
    if not session_id:
        raise HTTPException(status_code=401, detail="Authentication required. Please login first.")
    
    # Get the session
    session = auth_manager.get_session(session_id)
    if not session or session["status"] != "success":
        raise HTTPException(status_code=401, detail="Session expired. Please login again.")
    if not session.get('access_token'):
        raise HTTPException(status_code=401, detail="No access token.")

    async with aiohttp.ClientSession() as client_session:
        # Create API instance and set the access token directly
        api = Opower(client_session, "coned", session["username"], session["password"], None)
        api.access_token = session["access_token"]
        
        # Collect data using the token-authenticated API instance
        result = await collect_electricity_data(api)
    
    if not result:
        raise HTTPException(status_code=500, detail="Failed to collect electricity data")
    
    usage_data = result.get('usage_data', [])
    forecast_data = result.get('forecast_data', [])
    
    # Apply date filtering if provided (for usage data only)
    if start_date or end_date:
        filtered_data = []
        for point in usage_data:
            point_date = datetime.fromisoformat(point['start_time'].replace('Z', '+00:00')).date()
            
            if start_date and point_date < datetime.fromisoformat(start_date).date():
                continue
            if end_date and point_date > datetime.fromisoformat(end_date).date():
                continue
                
            filtered_data.append(point)
        usage_data = filtered_data
    
    # Apply limit if provided (for usage data only)
    if limit:
        usage_data = usage_data[:limit]
    
    return {
        "metadata": result.get('metadata', {}),
        "usage_data": usage_data,
        "usage_count": len(usage_data),
        "forecast_data": forecast_data,
        "forecast_count": len(forecast_data)
    }


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)