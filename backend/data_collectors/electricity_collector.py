#!/usr/bin/env python3
"""
Electricity data collection module using opower library.
Collects historical data at 15-minute intervals from ConEd.
"""

import json
import sys
import os
import asyncio
import aiohttp
import time
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import List, Dict, Optional
import pytz
import pandas as pd

# Add opower to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "opower" / "src"))

# Path to demo CSV fallback data
DEMO_CSV_PATH = Path(__file__).parent.parent / "data" / "demo_usage_data.csv"


def load_demo_csv_data() -> List[Dict]:
    """Load demo usage data from CSV file as fallback when API fails."""
    if not DEMO_CSV_PATH.exists():
        print(f"Demo CSV not found at {DEMO_CSV_PATH}")
        return []

    print(f"Loading demo data from CSV: {DEMO_CSV_PATH}")

    # Read CSV, skipping header rows until we find the data table
    with open(DEMO_CSV_PATH, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Find the row that starts with "TYPE" (the actual header)
    data_start_row = None
    for i, line in enumerate(lines):
        if line.strip().startswith('TYPE'):
            data_start_row = i
            break

    if data_start_row is None:
        print("Could not find data table header in CSV")
        return []

    # Parse CSV from the data table
    from io import StringIO
    csv_data = ''.join(lines[data_start_row:])
    df = pd.read_csv(StringIO(csv_data))

    # Convert to expected format
    usage_data = []
    for _, row in df.iterrows():
        try:
            # Parse date and times
            date_str = row['DATE']
            start_time_str = row['START TIME']
            end_time_str = row['END TIME']

            # Handle end time rollover (e.g., 23:45 -> 00:00 means next day)
            start_dt = datetime.strptime(f"{date_str} {start_time_str}", "%Y-%m-%d %H:%M")

            # End time might be like "00:14" which means same day, or "00:00" after "23:45"
            end_hour, end_min = map(int, end_time_str.split(':'))
            start_hour = start_dt.hour

            if end_hour == 0 and start_hour == 23:
                # Rolled over to next day
                end_dt = start_dt.replace(hour=0, minute=end_min) + timedelta(days=1)
            else:
                end_dt = start_dt.replace(hour=end_hour, minute=end_min)
                # Add 1 to minute since CSV shows "00:14" meaning end of interval
                end_dt = end_dt + timedelta(minutes=1)

            data_point = {
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
                "consumption_kwh": float(row['USAGE (kWh)']),
                "provided_cost": None
            }
            usage_data.append(data_point)
        except Exception as e:
            print(f"Error parsing row: {e}")
            continue

    print(f"Loaded {len(usage_data)} records from demo CSV")
    return usage_data

from opower import Opower, AggregateType, ReadResolution


from contextlib import asynccontextmanager

@asynccontextmanager
async def get_user_api(username: str, password: str, access_token: str):    
    async with aiohttp.ClientSession() as client_session:
        # Create API instance and set the access token directly
        api = Opower(client_session, "coned", username, password, None)
        api.access_token = access_token
        yield api



@asynccontextmanager
async def get_demo_api():    
    demo_username = os.getenv("DEMO_CONED_USERNAME")
    demo_password = os.getenv("DEMO_CONED_PASSWORD")
    demo_totp = os.getenv('DEMO_CONED_TOTP_SECRET')

    async with aiohttp.ClientSession() as client_session:
        # Create API instance and set the access token directly
        api = Opower(client_session, "coned", demo_username, demo_password, demo_totp)
        await api.async_login()
        yield api



async def fetch_forecast_data(api: Opower, account) -> List[Dict]:
    """Fetch ConEd forecast data"""
    try:
        print("Collecting forecast data for billing period and ConEd predictions")
        forecasts = await api.async_get_forecast()
        forecast_data = []
        
        for forecast in forecasts:
            if forecast.account.meter_type.value == 'ELEC':
                forecast_info = {
                    "bill_start_date": forecast.start_date.isoformat(),
                    "bill_end_date": forecast.end_date.isoformat(),
                    "current_date": forecast.current_date.isoformat(),
                    "unit_of_measure": forecast.unit_of_measure.value,
                    "usage_to_date": forecast.usage_to_date,
                    "cost_to_date": forecast.cost_to_date,
                    "forecasted_usage": forecast.forecasted_usage,
                    "forecasted_cost": forecast.forecasted_cost,
                    "typical_usage": forecast.typical_usage,
                    "typical_cost": forecast.typical_cost,
                    "account_id": forecast.account.utility_account_id
                }
                forecast_data.append(forecast_info)
        
        if not forecast_data:
            usage_reads = await api.async_get_usage_reads(
                account,
                AggregateType.BILL,
            )
            last_bill = usage_reads[-1]
            return [{
                'bill_start_date': last_bill.end_time.isoformat(),
                'bill_end_date': (last_bill.end_time + timedelta(days=30)).isoformat(),
                'usage_to_date': 0,
                'forecasted_usage': 0,
                "account_id": account.utility_account_id,
            }]
            
        print(f"Collected {len(forecast_data)} forecast records")
        return forecast_data
            
    except Exception as e:
        print(f"Error collecting forecast data: {e}")
        return []

async def collect_electricity_data(authenticated_api: Opower, start_date: Optional[date] = None, end_date: Optional[date] = None) -> Dict:
    """
    Full electricity data collection including usage and forecast data.
    
    Args:
        authenticated_api: Authenticated Opower API instance
        start_date: Start date for data collection (optional, defaults to 1 year ago)
        end_date: End date for data collection (optional, defaults to tomorrow)

    Returns:
        Dictionary with electricity usage data and forecast data
    """
    # Set date range for recent data (last 1 year to current)
    if start_date is None:
        start_date = (datetime.now() - timedelta(days=365)).date()
    if end_date is None:
        end_date = datetime.now().date() + timedelta(days=1)
    
    print(f"Collecting electricity data from {start_date} to {end_date}")
    
    start_time = time.time()

    api = authenticated_api
    
    # Get account info first
    account_start = time.time()
    accounts = await api.async_get_accounts()
    account_time = time.time() - account_start
    print(f"Account fetch took {account_time:.2f}s")
    
    if not accounts:
        raise Exception("No accounts found")
    
    # Find electricity account with 15-minute resolution
    elec_account = None
    for account in accounts:
        if account.meter_type.value == 'ELEC' and account.read_resolution and 'QUARTER' in account.read_resolution.value:
            elec_account = account
            break
    
    if not elec_account:
        raise Exception("No electricity account with 15-minute resolution found")
    
    # Now run all 3 data collection operations in parallel
    async def fetch_historical_usage():
        """Fetch historical usage data"""
        try:
            print(f"Collecting historical data from {start_date} to {end_date}")
            usage_reads = await api.async_get_usage_reads(
                account=elec_account,
                aggregate_type=AggregateType.QUARTER_HOUR,
                start_date=datetime.combine(start_date, datetime.min.time()),
                end_date=datetime.combine(end_date, datetime.min.time())
            )
            
            historical_data = []
            for read in usage_reads:
                data_point = {
                    "start_time": read.start_time.isoformat(),
                    "end_time": read.end_time.isoformat(),
                    "consumption_kwh": read.consumption,
                    "provided_cost": None  # Cost not available in usage reads
                }
                historical_data.append(data_point)
                
            print(f"Collected {len(historical_data)} historical records")
            return historical_data
                
        except Exception as e:
            print(f"Error collecting historical data: {e}")
            return []

    async def fetch_realtime_usage():
        """Fetch realtime usage data (last ~24 hours)"""
        try:
            print("Collecting realtime usage data (last ~24 hours)")
            realtime_reads = await api.async_get_realtime_usage_reads(account=elec_account)
            
            realtime_data = []
            for read in realtime_reads:
                data_point = {
                    "start_time": read.start_time.isoformat(),
                    "end_time": read.end_time.isoformat(),
                    "consumption_kwh": read.consumption,
                    "provided_cost": None  # Cost not available in usage reads
                }
                realtime_data.append(data_point)
                
            print(f"Collected {len(realtime_data)} realtime records")
            return realtime_data
                
        except Exception as e:
            print(f"Error collecting realtime data: {e}")
            return []

    # Run all 3 data collection operations in parallel
    collection_start = time.time()
    print("Starting parallel data collection...")
    historical_data, realtime_data, forecast_data = await asyncio.gather(
        fetch_historical_usage(),
        fetch_realtime_usage(), 
        fetch_forecast_data(api, elec_account)
    )
    collection_time = time.time() - collection_start
    print(f"Parallel data collection took {collection_time:.2f}s")
    
    # Combine usage data
    usage_data = historical_data + realtime_data
    
    # Remove duplicates and sort
    seen = set()
    unique_usage_data = []
    for item in usage_data:
        if item['start_time'] not in seen:
            seen.add(item['start_time'])
            unique_usage_data.append(item)
    
    unique_usage_data.sort(key=lambda x: x['start_time'])
    usage_data = unique_usage_data
    
    if not usage_data:
        print("No usage data collected")
        return {"status": "no_data", "usage_data": [], "forecast_data": []}
    
    total_time = time.time() - start_time
    print(f"Successfully collected {len(usage_data)} usage data points")
    print(f"Successfully collected {len(forecast_data)} forecast records")
    print(f"Total collection time: {total_time:.2f}s")
    print(f"  - Account fetch: {account_time:.2f}s ({account_time/total_time*100:.1f}%)")
    print(f"  - Data collection: {collection_time:.2f}s ({collection_time/total_time*100:.1f}%)")
    
    return {
        "status": "success",
        "usage_data": usage_data,
        "forecast_data": forecast_data,
        "metadata": {
            "collection_date": datetime.now().isoformat(),
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "total_records": len(usage_data),
            "timing": {
                "total_time": total_time,
                "account_time": account_time,
                "collection_time": collection_time
            }
        }
    }
