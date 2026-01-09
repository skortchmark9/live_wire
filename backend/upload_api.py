"""
Upload API for analyzing spreadsheet data
Supports CSV, XLSX, and other common spreadsheet formats
"""
import io
import logging
from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from pydantic import BaseModel
import pandas as pd
import requests

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/upload", tags=["upload"])


class UsageDataPoint(BaseModel):
    start_time: str
    end_time: str
    consumption_kwh: Optional[float]
    provided_cost: Optional[float] = None


class UploadResponse(BaseModel):
    status: str
    usage_data: List[UsageDataPoint]
    usage_count: int
    metadata: dict
    account_info: dict


def parse_metadata_sheet(xl: pd.ExcelFile) -> dict:
    """
    Parse the Metadata sheet to extract account info like zip code.
    """
    account_info = {}

    # Look for Metadata sheet
    metadata_sheets = ['Metadata', 'Info', 'Account']
    for sheet_name in metadata_sheets:
        if sheet_name in xl.sheet_names:
            try:
                df = pd.read_excel(xl, sheet_name=sheet_name)
                # The metadata is typically in key-value format in first two columns
                for _, row in df.iterrows():
                    if pd.notna(row.iloc[0]) and len(row) > 1 and pd.notna(row.iloc[1]):
                        key = str(row.iloc[0]).strip().lower().replace(' ', '_')
                        value = row.iloc[1]
                        account_info[key] = value

                logger.info(f"Parsed metadata: {account_info}")
                break
            except Exception as e:
                logger.warning(f"Failed to parse metadata sheet {sheet_name}: {e}")

    return account_info


def detect_columns(df: pd.DataFrame) -> dict:
    """
    Detect which columns contain date, time, and usage data.
    Returns a mapping of semantic names to actual column names.
    """
    columns = {col.lower().strip(): col for col in df.columns}
    mapping = {}

    # Date column detection
    date_patterns = ['date', 'day', 'dt']
    for pattern in date_patterns:
        for col_lower, col_original in columns.items():
            if pattern in col_lower:
                mapping['date'] = col_original
                break
        if 'date' in mapping:
            break

    # Start time column detection
    start_patterns = ['start time', 'start_time', 'starttime', 'begin', 'from']
    for pattern in start_patterns:
        for col_lower, col_original in columns.items():
            if pattern in col_lower:
                mapping['start_time'] = col_original
                break
        if 'start_time' in mapping:
            break

    # End time column detection
    end_patterns = ['end time', 'end_time', 'endtime', 'to', 'finish']
    for pattern in end_patterns:
        for col_lower, col_original in columns.items():
            if pattern in col_lower:
                mapping['end_time'] = col_original
                break
        if 'end_time' in mapping:
            break

    # Usage/consumption column detection
    usage_patterns = ['usage', 'kwh', 'consumption', 'energy', 'power', 'value']
    for pattern in usage_patterns:
        for col_lower, col_original in columns.items():
            if pattern in col_lower and 'cost' not in col_lower:
                mapping['usage'] = col_original
                break
        if 'usage' in mapping:
            break

    # Timestamp column detection (combined date+time)
    timestamp_patterns = ['timestamp', 'datetime', 'time']
    for pattern in timestamp_patterns:
        for col_lower, col_original in columns.items():
            if pattern == col_lower or (pattern in col_lower and 'start' not in col_lower and 'end' not in col_lower):
                mapping['timestamp'] = col_original
                break
        if 'timestamp' in mapping:
            break

    return mapping


def parse_time(time_str: str) -> str:
    """Parse time string to HH:MM format"""
    if pd.isna(time_str):
        return "00:00"

    time_str = str(time_str).strip()

    # Already in HH:MM format
    if ':' in time_str and len(time_str) <= 5:
        return time_str

    # Handle HH:MM:SS
    if ':' in time_str:
        parts = time_str.split(':')
        return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"

    return time_str


def parse_dataframe(df: pd.DataFrame) -> List[UsageDataPoint]:
    """
    Parse a dataframe into usage data points.
    Handles various column naming conventions.
    """
    # Skip header rows that might be metadata (like ConEd format)
    # Look for the row that contains column headers
    header_row = None
    for idx, row in df.iterrows():
        row_str = ' '.join(str(v).lower() for v in row.values if pd.notna(v))
        if 'date' in row_str and ('usage' in row_str or 'kwh' in row_str):
            header_row = idx
            break

    if header_row is not None:
        # Re-read with correct header
        df.columns = df.iloc[header_row]
        df = df.iloc[header_row + 1:].reset_index(drop=True)

    # Detect columns
    col_mapping = detect_columns(df)
    logger.info(f"Detected column mapping: {col_mapping}")

    if 'usage' not in col_mapping:
        raise ValueError("Could not detect usage/consumption column. Expected columns like 'USAGE (kWh)', 'consumption', 'kwh', etc.")

    usage_data = []

    for _, row in df.iterrows():
        try:
            # Get usage value
            usage_val = row[col_mapping['usage']]
            if pd.isna(usage_val):
                continue
            usage_kwh = float(usage_val)

            # Build timestamp
            if 'timestamp' in col_mapping:
                # Single timestamp column
                ts = pd.to_datetime(row[col_mapping['timestamp']])
                start_time = ts.isoformat()
                # Assume 15-minute intervals if no end time
                end_time = (ts + pd.Timedelta(minutes=15)).isoformat()
            elif 'date' in col_mapping:
                # Separate date and time columns
                date_val = row[col_mapping['date']]
                date_str = pd.to_datetime(date_val).strftime('%Y-%m-%d')

                if 'start_time' in col_mapping:
                    start_t = parse_time(row[col_mapping['start_time']])
                    start_time = f"{date_str}T{start_t}:00"
                else:
                    start_time = f"{date_str}T00:00:00"

                if 'end_time' in col_mapping:
                    end_t = parse_time(row[col_mapping['end_time']])
                    end_time = f"{date_str}T{end_t}:00"
                else:
                    # Assume 15-minute intervals
                    start_dt = pd.to_datetime(start_time)
                    end_time = (start_dt + pd.Timedelta(minutes=15)).isoformat()
            else:
                # Try to use index as datetime
                continue

            usage_data.append(UsageDataPoint(
                start_time=start_time,
                end_time=end_time,
                consumption_kwh=usage_kwh,
                provided_cost=None
            ))
        except Exception as e:
            logger.warning(f"Failed to parse row: {e}")
            continue

    return usage_data


@router.post("/analyze", response_model=UploadResponse)
async def analyze_spreadsheet(file: UploadFile = File(...)):
    """
    Upload a spreadsheet (CSV, XLSX, XLS) and get parsed usage data for analysis.

    The endpoint will auto-detect column mappings for:
    - Date columns: 'date', 'day', 'dt'
    - Start time: 'start time', 'start_time', 'begin'
    - End time: 'end time', 'end_time', 'finish'
    - Usage: 'usage', 'kwh', 'consumption', 'energy'
    - Or a combined timestamp column

    Returns data in the same format as the electricity-data endpoint.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    filename = file.filename.lower()

    # Read file content
    content = await file.read()

    account_info = {}

    try:
        # Parse based on file type
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith(('.xlsx', '.xls')):
            # Check for multiple sheets and find the one with interval/usage data
            xl = pd.ExcelFile(io.BytesIO(content))
            df = None

            # Parse metadata sheet for account info (zip code, etc.)
            account_info = parse_metadata_sheet(xl)

            # Look for sheets with usage data
            preferred_sheets = ['Interval Data', 'Usage', 'Data', 'Sheet1']
            for sheet_name in preferred_sheets:
                if sheet_name in xl.sheet_names:
                    df = pd.read_excel(xl, sheet_name=sheet_name)
                    logger.info(f"Using sheet: {sheet_name}")
                    break

            # If no preferred sheet found, try each sheet and pick the one with usage data
            if df is None:
                for sheet_name in xl.sheet_names:
                    test_df = pd.read_excel(xl, sheet_name=sheet_name)
                    cols_lower = ' '.join(str(c).lower() for c in test_df.columns)
                    if 'usage' in cols_lower or 'kwh' in cols_lower or 'consumption' in cols_lower:
                        df = test_df
                        logger.info(f"Found usage data in sheet: {sheet_name}")
                        break

            # Fall back to first sheet
            if df is None:
                df = pd.read_excel(xl, sheet_name=xl.sheet_names[0])
                logger.info(f"Falling back to first sheet: {xl.sheet_names[0]}")

        elif filename.endswith('.tsv'):
            df = pd.read_csv(io.BytesIO(content), sep='\t')
        else:
            # Try CSV as default
            try:
                df = pd.read_csv(io.BytesIO(content))
            except Exception:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file format. Please upload CSV, XLSX, or XLS files."
                )

        logger.info(f"Loaded file with {len(df)} rows and columns: {list(df.columns)}")

        # Parse the dataframe
        usage_data = parse_dataframe(df)

        if not usage_data:
            raise HTTPException(
                status_code=400,
                detail="Could not extract any usage data from the file. Please ensure it contains date/time and usage columns."
            )

        # Sort by start_time
        usage_data.sort(key=lambda x: x.start_time)

        return UploadResponse(
            status="success",
            usage_data=usage_data,
            usage_count=len(usage_data),
            metadata={
                "source": "upload",
                "filename": file.filename,
                "upload_time": datetime.now().isoformat(),
                "total_records": len(usage_data),
                "date_range": {
                    "start": usage_data[0].start_time if usage_data else None,
                    "end": usage_data[-1].start_time if usage_data else None
                }
            },
            account_info=account_info
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error processing file: {e}")
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")


# Zip code to lat/long mapping (common NY area codes)
ZIP_COORDS = {
    # NYC
    "10001": (40.7484, -73.9967),
    "10002": (40.7157, -73.9863),
    "10003": (40.7317, -73.9892),
    "10027": (40.8116, -73.9537),
    # Westchester
    "10566": (41.2901, -73.9212),  # Peekskill
    "10570": (41.1220, -73.7949),  # Pleasantville
    "10601": (41.0340, -73.7629),  # White Plains
    "10701": (40.9312, -73.8987),  # Yonkers
    # Default NYC
    "default": (40.7589, -73.9851),
}


def get_coords_for_zip(zip_code: str) -> tuple:
    """Get lat/long for a zip code, falling back to NYC default."""
    return ZIP_COORDS.get(zip_code, ZIP_COORDS["default"])


@router.get("/weather")
async def get_weather_for_range(
    zip_code: str = Query(..., description="ZIP code for location"),
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)")
):
    """
    Get historical weather data for a zip code and date range.
    Uses Open-Meteo API (free).
    """
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # Limit to ~7 days ago max for archive API
    days_ago = (date.today() - end).days
    if days_ago < 7:
        # Use forecast API for recent data
        end = date.today()

    lat, lon = get_coords_for_zip(zip_code)
    logger.info(f"Fetching weather for ZIP {zip_code} ({lat}, {lon}) from {start} to {end}")

    # Open-Meteo Archive API for historical data
    base_url = "https://archive-api.open-meteo.com/v1/archive"

    all_weather = []
    current = start

    # Chunk by month
    from datetime import timedelta
    while current < end:
        if current.month == 12:
            next_month = current.replace(year=current.year + 1, month=1, day=1)
        else:
            next_month = current.replace(month=current.month + 1, day=1)

        # Calculate month end (last day of current month or end date, whichever is earlier)
        last_day_of_month = next_month - timedelta(days=1)
        month_end = min(last_day_of_month, end)

        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": current.isoformat(),
            "end_date": month_end.isoformat(),
            "hourly": ["temperature_2m", "relative_humidity_2m"],
            "temperature_unit": "fahrenheit",
            "timezone": "America/New_York"
        }

        try:
            resp = requests.get(base_url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            hourly = data.get("hourly", {})
            times = hourly.get("time", [])
            temps = hourly.get("temperature_2m", [])
            humidity = hourly.get("relative_humidity_2m", [])

            for i, t in enumerate(times):
                all_weather.append({
                    "timestamp": t,
                    "temperature_f": temps[i] if i < len(temps) else None,
                    "humidity_percent": humidity[i] if i < len(humidity) else None
                })
        except Exception as e:
            logger.warning(f"Failed to fetch weather for {current} to {month_end}: {e}")

        current = month_end + timedelta(days=1)

    return {
        "data": all_weather,
        "metadata": {
            "zip_code": zip_code,
            "coordinates": {"lat": lat, "lon": lon},
            "start_date": start_date,
            "end_date": end_date,
            "total_records": len(all_weather)
        }
    }
