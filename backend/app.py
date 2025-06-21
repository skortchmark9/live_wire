import asyncio
import json
import os
import sys
import subprocess
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Optional, List, Dict
import logging

from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
SCRIPTS_DIR = Path(__file__).parent.parent

# In-memory storage for collection status
collection_status = {
    "electricity": {"status": "idle", "last_run": None, "progress": None, "error": None},
    "weather": {"status": "idle", "last_run": None, "progress": None, "error": None}
}

def is_data_stale(filename: str, max_age_hours: int = 6) -> bool:
    """Check if data file is stale (older than max_age_hours)"""
    try:
        file_path = DATA_DIR / filename
        if not file_path.exists():
            return True
        
        file_age = datetime.now() - datetime.fromtimestamp(file_path.stat().st_mtime)
        return file_age.total_seconds() > (max_age_hours * 3600)
    except Exception:
        return True

# In-memory cache for collected data
data_cache = {
    "electricity": {"data": None, "last_updated": None},
    "weather": {"data": None, "last_updated": None}
}

async def get_fresh_data(data_type: str) -> Optional[dict]:
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
            from data_collectors.electricity_collector import collect_electricity_data_full
            
            # Use hardcoded credentials for now
            username = "samkortchmar@gmail.com"
            password = os.getenv("CONED_PASSWORD")
            totp_secret = "QFBUCOQ5UJWQJVF6"
            
            if not password:
                logger.error("CONED_PASSWORD environment variable not set")
                return None
            
            result = await collect_electricity_data_full(username, password, totp_secret)
            
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

async def run_data_collector(collector_type: str, user_credentials: Optional[dict] = None):
    """Run data collection script asynchronously"""
    global collection_status
    
    try:
        collection_status[collector_type]["status"] = "running"
        collection_status[collector_type]["progress"] = "Starting collection..."
        collection_status[collector_type]["error"] = None
        
        if collector_type == "electricity":
            script_path = SCRIPTS_DIR / "data_collector.py"
        elif collector_type == "weather":
            script_path = SCRIPTS_DIR / "weather_collector.py"
        else:
            raise ValueError(f"Unknown collector type: {collector_type}")
        
        if not script_path.exists():
            raise FileNotFoundError(f"Script not found: {script_path}")
        
        # Set up environment variables for electricity collection
        env = os.environ.copy()
        if collector_type == "electricity" and user_credentials:
            env.update({
                "CONED_USERNAME": user_credentials.get("username", ""),
                "CONED_PASSWORD": user_credentials.get("password", ""),
                "CONED_TOTP_SECRET": user_credentials.get("totp_secret", "")
            })
        
        collection_status[collector_type]["progress"] = f"Running {collector_type} collection script..."
        
        # Run the script
        process = await asyncio.create_subprocess_exec(
            sys.executable, str(script_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0:
            collection_status[collector_type]["status"] = "completed"
            collection_status[collector_type]["progress"] = "Collection completed successfully"
            collection_status[collector_type]["last_run"] = datetime.now().isoformat()
            logger.info(f"{collector_type} collection completed successfully")
        else:
            error_msg = stderr.decode() if stderr else "Unknown error"
            collection_status[collector_type]["status"] = "failed"
            collection_status[collector_type]["error"] = error_msg
            logger.error(f"{collector_type} collection failed: {error_msg}")
            
    except Exception as e:
        collection_status[collector_type]["status"] = "failed"
        collection_status[collector_type]["error"] = str(e)
        logger.error(f"Error running {collector_type} collection: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.get("/api/electricity-usage")
async def get_electricity_usage(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: Optional[int] = Query(None)
):
    """Get electricity usage data, collecting fresh data directly"""
    try:
        # Get fresh data directly from collectors
        result = await get_fresh_data("electricity")
        if not result:
            raise HTTPException(status_code=500, detail="Failed to collect electricity usage data")
        
        usage_data = result.get('usage_data', [])
        
        # Apply date filtering if provided
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
        
        # Apply limit if provided
        if limit:
            usage_data = usage_data[:limit]
        
        return {
            "metadata": result.get('metadata', {}),
            "data": usage_data,
            "count": len(usage_data)
        }
        
    except Exception as e:
        logger.error(f"Error in get_electricity_usage: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

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

@app.get("/api/coned-forecast")
async def get_coned_forecast():
    """Get ConEd billing forecast"""
    try:
        # Get fresh electricity data which includes forecast data
        result = await get_fresh_data("electricity")
        if not result:
            raise HTTPException(status_code=500, detail="Failed to collect ConEd forecast data")
        
        forecast_data = result.get('forecast_data', [])
        
        return {
            "metadata": {
                "collection_date": result.get('metadata', {}).get('collection_date'),
                "source": "ConEd via Opower API"
            },
            "forecasts": forecast_data
        }
        
    except Exception as e:
        logger.error(f"Error in get_coned_forecast: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/electricity-data")
async def get_electricity_data_combined(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: Optional[int] = Query(None)
):
    """Get combined electricity usage and forecast data in a single request"""
    try:
        # Get fresh data directly from collectors
        result = await get_fresh_data("electricity")
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
        
    except Exception as e:
        logger.error(f"Error in get_electricity_data_combined: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/data-status")
async def get_data_status():
    """Get status of all data files"""
    files = ['electricity_usage.json', 'weather_data.json', 'predictions.json', 'coned_forecast.json']
    status = {}
    
    for filename in files:
        file_path = DATA_DIR / filename
        if file_path.exists():
            stat = file_path.stat()
            status[filename] = {
                "exists": True,
                "size_bytes": stat.st_size,
                "last_modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
            }
        else:
            status[filename] = {"exists": False}
    
    return {"data_files": status}

@app.post("/api/collect/weather")
async def trigger_weather_collection(background_tasks: BackgroundTasks):
    """Trigger weather data collection"""
    if collection_status["weather"]["status"] == "running":
        raise HTTPException(status_code=409, detail="Weather collection already in progress")
    
    background_tasks.add_task(run_data_collector, "weather")
    
    return {
        "message": "Weather data collection started",
        "status": "started",
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/collect/electricity")
async def trigger_electricity_collection(
    background_tasks: BackgroundTasks,
    credentials: Optional[dict] = None
):
    """Trigger electricity data collection"""
    if collection_status["electricity"]["status"] == "running":
        raise HTTPException(status_code=409, detail="Electricity collection already in progress")
    
    # For now, keep the hardcoded credentials from the original script
    # TODO: Replace with user authentication flow
    user_credentials = {
        "username": "samkortchmar@gmail.com",
        "password": os.getenv("CONED_PASSWORD"),
        "totp_secret": "QFBUCOQ5UJWQJVF6"
    }
    
    if not user_credentials["password"]:
        raise HTTPException(status_code=400, detail="CONED_PASSWORD environment variable not set")
    
    background_tasks.add_task(run_data_collector, "electricity", user_credentials)
    
    return {
        "message": "Electricity data collection started",
        "status": "started",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/collect/status")
async def get_collection_status():
    """Get the status of data collection operations"""
    return {
        "collections": collection_status,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/collect/status/{collection_type}")
async def get_specific_collection_status(collection_type: str):
    """Get the status of a specific data collection operation"""
    if collection_type not in collection_status:
        raise HTTPException(status_code=404, detail=f"Collection type '{collection_type}' not found")
    
    return {
        "collection_type": collection_type,
        "status": collection_status[collection_type],
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    # Verify data directory exists
    if not DATA_DIR.exists():
        logger.error(f"Data directory not found: {DATA_DIR}")
        print(f"Please ensure the data directory exists at: {DATA_DIR}")
    else:
        logger.info(f"Using data directory: {DATA_DIR}")
    
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)