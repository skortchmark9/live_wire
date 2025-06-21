import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Optional, List, Dict
import logging

from fastapi import FastAPI, HTTPException, Query, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Live Wire API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
DATA_DIR = Path(__file__).parent.parent / "electricity-tracker" / "public" / "data"



# In-memory cache for collected data
data_cache = {
    "electricity": {"data": None, "last_updated": None},
    "weather": {"data": None, "last_updated": None}
}

# Import auth manager
from user import auth_manager

# Request models
class LoginRequest(BaseModel):
    username: str
    password: str

class MFARequest(BaseModel):
    session_id: str
    mfa_code: str

async def get_fresh_data(data_type: str, session: dict = None) -> Optional[dict]:
    """Get fresh data, collecting if not cached or stale"""
    global data_cache
    
    if data_type == "electricity":
        max_age_hours = 2  # Electricity data cache for 2 hours to avoid multiple logins
    elif data_type == "weather":
        max_age_hours = 6  # Weather data can be older (6 hours)
    else:
        return None
    
    # Check if cached data is still fresh
    cached_entry = data_cache.get(data_type)
    if (cached_entry and cached_entry["data"] and cached_entry["last_updated"] and
        (datetime.now() - cached_entry["last_updated"]).total_seconds() < (max_age_hours * 3600)):
        logger.info(f"Using cached {data_type} data (cached {(datetime.now() - cached_entry['last_updated']).total_seconds():.0f} seconds ago)")
        return cached_entry["data"]
    
    logger.info(f"Collecting fresh {data_type} data...")
    
    try:
        if data_type == "electricity":
            if session and session.get("access_token"):
                # Create API instance with stored access token
                import aiohttp
                import sys
                from pathlib import Path
                
                # Add opower to path
                sys.path.insert(0, str(Path(__file__).parent.parent / "opower" / "src"))
                from opower import Opower
                from data_collectors.electricity_collector import collect_electricity_data
                
                async with aiohttp.ClientSession() as client_session:
                    # Create API instance and set the access token directly
                    api = Opower(client_session, "coned", session["username"], session["password"], None)
                    api.access_token = session["access_token"]
                    
                    # Collect data using the token-authenticated API instance
                    result = await collect_electricity_data(api)
            else:
                # No access token - this shouldn't happen in normal flow
                logger.error("No access token provided for electricity data collection")
                return None
            
            if result["status"] == "success":
                logger.info(f"Electricity data collection completed: {len(result['usage_data'])} usage records, {len(result['forecast_data'])} forecast records")
                data_cache[data_type] = {
                    "data": result,
                    "last_updated": datetime.now()
                }
                return result
            else:
                logger.error(f"Electricity data collection failed: {result.get('error', 'Unknown error')}")
                return None
                
        elif data_type == "weather":
            from data_collectors.weather_collector import collect_weather_data_full
            
            result = collect_weather_data_full()
            
            if result["status"] == "success":
                logger.info(f"Weather data collection completed: {len(result['weather_data'])} records")
                data_cache[data_type] = {
                    "data": result,
                    "last_updated": datetime.now()
                }
                return result
            else:
                logger.error(f"Weather data collection failed: {result.get('error', 'Unknown error')}")
                return None
            
    except Exception as e:
        logger.error(f"Error collecting {data_type} data: {str(e)}")
        return None

def load_json_file(filename: str) -> Optional[dict]:
    """Load JSON file from data directory"""
    try:
        file_path = DATA_DIR / filename
        if not file_path.exists():
            logger.warning(f"File not found: {file_path}")
            return None
        
        with open(file_path, 'r') as file:
            return json.load(file)
    except Exception as e:
        logger.error(f"Error loading {filename}: {str(e)}")
        return None


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.get("/api/weather-data")
async def get_weather_data(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: Optional[int] = Query(None)
):
    """Get weather data, collecting fresh data directly"""
    try:
        # Get fresh data directly from collectors
        result = await get_fresh_data("weather")
        if not result:
            raise HTTPException(status_code=500, detail="Failed to collect weather data")
        
        weather_data = result.get('weather_data', [])
        
        # Apply date filtering if provided
        if start_date or end_date:
            filtered_data = []
            for point in weather_data:
                point_date = datetime.fromisoformat(point['timestamp']).date()
                
                if start_date and point_date < datetime.fromisoformat(start_date).date():
                    continue
                if end_date and point_date > datetime.fromisoformat(end_date).date():
                    continue
                    
                filtered_data.append(point)
            weather_data = filtered_data
        
        # Apply limit if provided
        if limit:
            weather_data = weather_data[:limit]
        
        return {
            "metadata": result.get('metadata', {}),
            "data": weather_data,
            "count": len(weather_data)
        }
        
    except Exception as e:
        logger.error(f"Error in get_weather_data: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/predictions")
async def get_predictions(limit: Optional[int] = Query(None)):
    """Get ML model predictions"""
    try:
        data = load_json_file('predictions.json')
        if data is None:
            raise HTTPException(status_code=404, detail="Predictions data not found")
        
        predictions = data.get('predictions', [])
        
        # Apply limit if provided
        if limit:
            predictions = predictions[:limit]
        
        return {
            "metadata": data.get('metadata', {}),
            "predictions": predictions,
            "count": len(predictions)
        }
        
    except Exception as e:
        logger.error(f"Error in get_predictions: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/auth/login")
async def login(request: LoginRequest, response: Response):
    """Initiate login flow and return session ID for MFA"""
    session_id = await auth_manager.create_session(request.username, request.password)
    
    # Set session cookie with the session_id
    response.set_cookie(
        key="user_session", 
        value=session_id,
        httponly=False,  # Allow JS access for development
        secure=False,  # Set to True in production with HTTPS
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
    print(request.session_id, request.mfa_code)
    success = await auth_manager.submit_mfa(request.session_id, request.mfa_code)
    print(auth_manager.mfa_sessions)
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
    
    # If successful, cache the data for future requests
    if session["status"] == "success" and session.get("result"):
        global data_cache
        data_cache["electricity"] = {
            "data": session["result"],
            "last_updated": datetime.now()
        }
    
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
    
    # Use session for data collection
    result = await get_fresh_data("electricity", session=session)
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
    # Verify data directory exists
    if not DATA_DIR.exists():
        logger.error(f"Data directory not found: {DATA_DIR}")
        print(f"Please ensure the data directory exists at: {DATA_DIR}")
    else:
        logger.info(f"Using data directory: {DATA_DIR}")
    
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)