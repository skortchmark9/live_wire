"""
Rates API endpoints with WebSocket support for progress tracking
"""
import asyncio
import os
from datetime import datetime, timedelta
from typing import Optional, Dict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
import logging

from rates.google_drive_client import GoogleDriveClient
from rates.excel_processor import ExcelProcessor
from rates.rate_calculator import RateCalculator
from rates.region_detector import RegionDetector
from user import auth_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rates", tags=["rates"])

# Constants
TEMPLATE_ID = "1O08jgc4Zmg0UACKCK_j-9xzcnPdAMy9BOlA21Gzbm1k"
FOLDER_ID = "1f86cWxqcSF57icLWyCStxgPWczz_FVvc"

# Global exception handler for background tasks
async def handle_background_task_error(session_id: str, error: Exception):
    """Send error to frontend when background task fails"""
    logger.error(f"Background task error for session {session_id}: {error}", exc_info=True)
    await manager.send_progress(session_id, {
        "step": "error",
        "message": str(error),
        "progress": 0
    })

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]

    async def send_progress(self, session_id: str, message: dict):
        if session_id not in self.active_connections:
            logger.warning(f"No active WebSocket connection for session {session_id} - cannot send {message.get('step')}")
            return
        try:
            await self.active_connections[session_id].send_json(message)
            logger.info(f"✓ Sent WebSocket message to {session_id}: {message.get('step')} - {message.get('progress')}%")
        except Exception as e:
            logger.error(f"✗ Failed to send WebSocket message to {session_id}: {e}")
            self.disconnect(session_id)

manager = ConnectionManager()

class RateCalculationRequest(BaseModel):
    session_id: str
    start_date: Optional[str] = "2024-08-01"
    end_date: Optional[str] = "2025-07-31"

@router.get("/status")
async def rates_status():
    """Debug endpoint to check if rates API is working"""
    return {"status": "rates API is working", "endpoints": ["status", "calculate", "ws"]}

@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time progress updates"""
    await manager.connect(websocket, session_id)
    logger.info(f"WebSocket connected for session {session_id}")
    try:
        while True:
            # Wait for any message from client (including pings)
            data = await websocket.receive_text()
            # Send pong if we get a ping
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
        manager.disconnect(session_id)
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
        manager.disconnect(session_id)

async def safe_background_task(coro, session_id: str):
    """Wrapper to handle exceptions in background tasks"""
    try:
        await coro
    except Exception as e:
        await handle_background_task_error(session_id, e)

@router.post("/calculate")
async def calculate_rates(request: RateCalculationRequest):
    """Start rate calculation process for an authenticated session"""
    session = auth_manager.mfa_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=401, detail=f"Session not found: {request.session_id}")
    
    # Check for different possible success statuses from your auth system
    valid_statuses = ["authenticated", "success", "completed"]
    if session.get("status") not in valid_statuses:
        raise HTTPException(status_code=401, detail=f"Session status is {session.get('status')}, expected one of {valid_statuses}")
    
    asyncio.create_task(
        safe_background_task(
            process_rate_calculation(
                request.session_id,
                session["username"],
                session["password"],
                request.start_date,
                request.end_date
            ),
            request.session_id
        )
    )
    
    return {"status": "processing", "message": "Rate calculation started"}

async def send_progress(session_id: str, step: str, message: str, progress: int, **kwargs):
    """Helper to send progress updates"""
    data = {
        "step": step,
        "message": message,
        "progress": progress,
        **kwargs
    }
    logger.info(f"[{session_id[:8]}] Sending: {step} ({progress}%)")
    await manager.send_progress(session_id, data)
    
    # Small delay to allow frontend to process the update
    await asyncio.sleep(0.1)

async def download_template(session_id: str, google_client: GoogleDriveClient) -> str:
    """Download template from Google Drive"""
    await send_progress(session_id, "downloading_template", 
                       "Downloading template from Google Drive...", 10)
    
    template_path = f"/tmp/template_{session_id}.xlsx"
    if not google_client.download_sheet_as_excel(TEMPLATE_ID, template_path):
        raise HTTPException(status_code=500, detail="Failed to download template")
    
    return template_path

async def fetch_coned_data(session_id: str, username: str, password: str, 
                          start_date: datetime, end_date: datetime) -> tuple:
    """Fetch ConEd usage data using existing authenticated session"""
    session = auth_manager.mfa_sessions.get(session_id)
    if not session or not session.get("access_token"):
        raise HTTPException(status_code=401, detail="No access token found in session")
    
    await send_progress(session_id, "authenticating_coned", 
                       "Using existing ConEd session...", 20)
    
    # Import the get_user_api function to reuse existing authenticated connection
    from data_collectors.electricity_collector import get_user_api
    
    async with get_user_api(username, password, session["access_token"]) as api:
        await send_progress(session_id, "fetching_account",
                           "Getting account information...", 30)
        
        accounts = await api.async_get_accounts()
        
        # Find electric account with quarter-hour resolution and detect region
        elec_account = None
        region_code = None
        for account in accounts:
            if (account.meter_type.value == 'ELEC' and 
                account.read_resolution and 
                'QUARTER' in account.read_resolution.value):
                elec_account = account
                account_id = account.id
                
                # Detect region from customer address
                if account.customer.address:
                    region_code = RegionDetector.detect_region(account.customer.address)
                    if region_code:
                        region_desc = RegionDetector.get_region_description(region_code)
                        logger.info(f"Detected rate region: {region_code} ({region_desc})")
                    else:
                        logger.warning("Could not determine rate region from customer address")
                else:
                    logger.warning("No address information available for region detection")
                
                print(f"Using electric account: {account.id}")
                break
        
        if not elec_account:
            raise Exception("No electric account with 15-minute interval capability found")
        
        await send_progress(session_id, "fetching_usage",
                           f"Fetching usage data from {start_date.date()} to {end_date.date()}...", 40)
        
        data_points = await fetch_usage_with_progress_direct(
            session_id, api, elec_account, start_date, end_date
        )
        
        return data_points, account_id, region_code

async def fetch_usage_with_progress_direct(session_id: str, api, 
                                          account, start_date: datetime, end_date: datetime) -> list:
    """Fetch usage data in chunks with progress updates using existing API"""
    from opower import AggregateType
    
    data_points = []
    total_days = (end_date - start_date).days
    processed_days = 0
    current_start = start_date
    chunk_days = 30
    
    while current_start < end_date:
        current_end = min(current_start + timedelta(days=chunk_days), end_date)
        
        usage_reads = await api.async_get_usage_reads(
            account,
            AggregateType.QUARTER_HOUR,
            start_date=current_start,
            end_date=current_end
        )
        
        for reading in usage_reads:
            data_points.append({
                'timestamp': reading.start_time,
                'end_time': reading.end_time,
                'usage_kwh': reading.consumption
            })
        
        processed_days += chunk_days
        progress = 40 + int((processed_days / total_days) * 30)
        
        await send_progress(session_id, "fetching_usage",
                           f"Fetched {len(data_points)} data points...",
                           min(progress, 70))
        
        current_start = current_end + timedelta(days=1)
    
    return data_points


async def fill_and_upload(session_id: str, google_client: GoogleDriveClient,
                         template_path: str, data_points: list, 
                         username: str, account_id: str, region_code: str = None) -> str:
    """Fill template and upload to Google Drive"""
    await send_progress(session_id, "filling_template",
                       f"Filling template with {len(data_points)} data points...", 75)
    
    output_path = f"/tmp/filled_{session_id}.xlsx"
    filled_count = await ExcelProcessor.fill_template(
        template_path, output_path, data_points, username, account_id, region_code
    )
    
    await send_progress(session_id, "filling_template",
                       f"Filled {filled_count} rows successfully", 80)
    
    await send_progress(session_id, "uploading",
                       "Uploading to Google Drive...", 85)
    
    sheet_name = f"ConEd Rates - {username.split('@')[0]} - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    logger.info(f"Starting upload to Google Drive: {sheet_name}")
    
    spreadsheet_id = google_client.upload_excel_as_sheet(output_path, sheet_name, FOLDER_ID)
    
    if not spreadsheet_id:
        raise HTTPException(status_code=500, detail="Failed to upload to Google Drive")
    
    logger.info(f"Upload successful: {spreadsheet_id}")
    
    await send_progress(session_id, "uploading",
                       "Upload complete!", 90)
    
    # Clean up temp file
    if os.path.exists(output_path):
        os.remove(output_path)
    
    return spreadsheet_id, filled_count

async def calculate_and_send_results(session_id: str, google_client: GoogleDriveClient,
                                    spreadsheet_id: str, data_points: list, filled_count: int):
    """Calculate rates and send final results"""
    await send_progress(session_id, "calculating_rates",
                       "Calculating rate costs...", 95)
    
    costs = RateCalculator.get_calculated_rates(google_client, spreadsheet_id)
    spreadsheet_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit"
    
    best_rate = worst_rate = potential_savings = None
    if costs:
        best_rate = min(costs.items(), key=lambda x: x[1])
        worst_rate = max(costs.items(), key=lambda x: x[1])
        potential_savings = worst_rate[1] - best_rate[1]
    
    await send_progress(session_id, "completed",
                       "Rate calculation completed!", 100,
                       result={
                           "costs": costs,
                           "best_rate": best_rate[0] if best_rate else None,
                           "best_rate_cost": best_rate[1] if best_rate else None,
                           "worst_rate": worst_rate[0] if worst_rate else None,
                           "worst_rate_cost": worst_rate[1] if worst_rate else None,
                           "potential_savings": potential_savings,
                           "spreadsheet_url": spreadsheet_url,
                           "data_points_count": len(data_points),
                           "filled_rows": filled_count
                       })

async def process_rate_calculation(session_id: str, username: str, password: str,
                                  start_date_str: str, end_date_str: str):
    """Main process for rate calculation - exceptions handled by wrapper"""
    template_path = None
    try:
        # Parse dates
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
        
        await send_progress(session_id, "initializing", 
                           "Initializing Google Drive client...", 5)
        
        google_client = GoogleDriveClient(
            credentials_path='rates/credentials.json',
            token_path='rates/token.json'
        )
        
        template_path = await download_template(session_id, google_client)
        
        data_points, account_id, region_code = await fetch_coned_data(
            session_id, username, password, start_date, end_date
        )
        
        spreadsheet_id, filled_count = await fill_and_upload(
            session_id, google_client, template_path, 
            data_points, username, account_id, region_code
        )
        
        await calculate_and_send_results(
            session_id, google_client, spreadsheet_id, 
            data_points, filled_count
        )
    finally:
        # Always clean up temp files
        if template_path and os.path.exists(template_path):
            os.remove(template_path)