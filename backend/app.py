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
from data_collectors.electricity_collector import collect_electricity_data, get_user_api, load_demo_csv_data
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
import rates_api

# Configure logging with both console and file output
import logging.handlers

# Create logs directory if it doesn't exist
os.makedirs('logs', exist_ok=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Console output
        logging.handlers.RotatingFileHandler(
            'logs/app.log',
            maxBytes=10*1024*1024,  # 10MB
            backupCount=5
        )
    ]
)

logger = logging.getLogger(__name__)
logger.info('Live Wire backend starting up')

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

# Thread-safe TTL cache for demo data (15 minute TTL, max 10 item)
data_cache = TTLCache(maxsize=10, ttl=900)  # 15 minutes = 900 seconds

async def cached_collect_electricity_data(api, cache_key, is_demo=False):
    if cache_key in data_cache:
        logger.info("Returning cached demo data")
        return data_cache[cache_key]

    logger.info("Cache miss - fetching fresh data from ConEd")
    result = await collect_electricity_data(api)

    # For demo users, fall back to CSV if API returns empty data
    usage_data = result.get('usage_data', []) if result else []
    if is_demo and len(usage_data) == 0:
        logger.info("API returned no data for demo - falling back to CSV")
        csv_data = load_demo_csv_data()
        if csv_data:
            result = {
                "status": "success",
                "usage_data": csv_data,
                "forecast_data": result.get('forecast_data', []) if result else [],
                "metadata": {
                    "collection_date": datetime.now().isoformat(),
                    "source": "csv_fallback",
                    "total_records": len(csv_data)
                }
            }
            logger.info(f"Loaded {len(csv_data)} records from CSV fallback")

    if result:
        data_cache[cache_key] = result
        logger.info("Data cached for 15 minutes")

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
raw_origins = os.getenv("ALLOWED_ORIGINS", "localhost:3000,localhost:3001,localhost:3002,127.0.0.1:3000,127.0.0.1:3002,127.0.0.1:3001").split(",")
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
    app_domain = os.getenv('APP_DOMAIN')
    cookie_domain = f'.{app_domain}' if app_domain else None
    is_production = cookie_domain is not None

    session_id = await auth_manager.create_demo_session(demo_username, demo_password)

    logger.info(f"Setting demo cookie - Production: {is_production}, Domain: {cookie_domain}")
    response.set_cookie(
        key="user_session", 
        value=session_id,
        domain=cookie_domain,  # None for localhost, .domain for production
        secure=is_production,  # False for localhost HTTP, True for production HTTPS
        samesite="none" if is_production else "lax",  # none for cross-domain, lax for localhost
        max_age=7200  # 2 hours
    )
    
    return {
        "session_id": session_id,
        "status": "success",
        "message": "Authenticated with demo account"
    }


@app.post("/api/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, login_request: LoginRequest, response: Response):
    """Initiate login flow and return session ID for MFA"""
    logger.info(f"Login attempt for user: {login_request.username}")
    session_id = await auth_manager.create_session(login_request.username, login_request.password)
    
    # Set session cookie with the session_id
    # Use APP_DOMAIN for cookie domain (None for localhost, .domain for production)
    app_domain = os.getenv('APP_DOMAIN')
    cookie_domain = f'.{app_domain}' if app_domain else None
    is_production = cookie_domain is not None
    
    logger.info(f"Setting cookie - Production: {is_production}, Domain: {cookie_domain}")
    response.set_cookie(
        key="user_session", 
        value=session_id,
        domain=cookie_domain,  # None for localhost, .domain for production
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

    if not session_id:
        raise HTTPException(status_code=401, detail="Authentication required. Please login first.")
    
    session = auth_manager.get_session(session_id)
    if not session or session["status"] != "success":
        raise HTTPException(status_code=401, detail="Session expired. Please login again.")
    if not session.get('access_token'):
        raise HTTPException(status_code=401, detail="No access token.")
    
    is_demo = session.get('is_demo')

    try:
        async with get_user_api(session['username'], session['password'], session['access_token']) as api:
            key = 'demo' if is_demo else session['access_token']
            result = await cached_collect_electricity_data(api, key, is_demo=is_demo)
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

# Include rates API router
app.include_router(rates_api.router)

# Include payments API router
from payments.payment_api import router as payment_router
app.include_router(payment_router)

# Include documents API router
from documents.document_api import router as document_router
app.include_router(document_router)

# Include upload API router
import upload_api
app.include_router(upload_api.router)

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=5050, reload=True)
