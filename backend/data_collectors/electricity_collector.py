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
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import List, Dict, Optional
import pytz

# Add opower to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "opower" / "src"))

from opower import Opower, AggregateType, ReadResolution


async def collect_electricity_data(api: Opower, elec_account, start_date: date, end_date: date) -> List[Dict]:
    """
    Collect electricity usage data from ConEd using opower API.
    
    Args:
        api: Initialized and logged-in Opower API instance
        elec_account: Electricity account object
        start_date: Start date for data collection
        end_date: End date for data collection
    
    Returns:
        List of usage data points
    """
    
    print(f"Using account: {elec_account.utility_account_id}")
    
    # Collect data in chunks (ConEd API has limits)
    all_data = []
    current_date = start_date
    chunk_days = 7  # Process 1 week at a time
    
    while current_date < end_date:
        chunk_end = min(current_date + timedelta(days=chunk_days), end_date)
        
        print(f"Collecting data from {current_date} to {chunk_end}")
        
        try:
            usage_reads = await api.async_get_usage_reads(
                account=elec_account,
                aggregate_type=AggregateType.QUARTER_HOUR,
                start_date=datetime.combine(current_date, datetime.min.time()),
                end_date=datetime.combine(chunk_end, datetime.min.time())
            )
            
            for read in usage_reads:
                data_point = {
                    "start_time": read.start_time.isoformat(),
                    "end_time": read.end_time.isoformat(),
                    "consumption_kwh": read.consumption,
                    "provided_cost": None  # Cost not available in usage reads
                }
                all_data.append(data_point)
                
        except Exception as e:
            print(f"Error collecting data for {current_date} to {chunk_end}: {e}")
            
        current_date = chunk_end
    
    # Also get realtime data (last ~24 hours) to ensure we have the most recent data
    print("Collecting realtime usage data (last ~24 hours)")
    try:
        realtime_reads = await api.async_get_realtime_usage_reads(account=elec_account)
        
        for read in realtime_reads:
            data_point = {
                "start_time": read.start_time.isoformat(),
                "end_time": read.end_time.isoformat(),
                "consumption_kwh": read.consumption,
                "provided_cost": None  # Cost not available in usage reads
            }
            all_data.append(data_point)
            
    except Exception as e:
        print(f"Error collecting realtime data: {e}")
    
    # Remove duplicates and sort
    seen = set()
    unique_data = []
    for item in all_data:
        if item['start_time'] not in seen:
            seen.add(item['start_time'])
            unique_data.append(item)
    
    unique_data.sort(key=lambda x: x['start_time'])
    return unique_data


async def collect_coned_forecast_data(api: Opower) -> List[Dict]:
    """
    Collect ConEd forecast data for billing period alignment and predictions.
    
    Args:
        api: Initialized and logged-in Opower API instance
        
    Returns:
        List of forecast data
    """
    print("Collecting forecast data for billing period and ConEd predictions")
    try:
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
        
        print(f"Collected {len(forecast_data)} forecast records")
        return forecast_data
            
    except Exception as e:
        print(f"Error collecting forecast data: {e}")
        return []


async def collect_electricity_data_full(username: str, password: str, totp_secret: str) -> Dict:
    """
    Full electricity data collection including usage and forecast data.
    
    Args:
        username: ConEd username
        password: ConEd password  
        totp_secret: 2FA TOTP secret
        
    Returns:
        Dictionary with electricity usage data and forecast data
    """
    
    # Set date range for recent data (last 30 days to current)
    start_date = (datetime.now() - timedelta(days=30)).date()
    end_date = datetime.now().date() + timedelta(days=1)
    
    print(f"Collecting electricity data from {start_date} to {end_date}")
    
    async with aiohttp.ClientSession() as session:
        try:
            # Initialize opower client with utility name as string
            api = Opower(session, "coned", username, password, totp_secret)
            
            # Login only once
            print("Logging into ConEd...")
            await api.async_login()
            print("Login successful")
            
            # Get account info
            accounts = await api.async_get_accounts()
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
            
            # Collect usage data
            usage_data = await collect_electricity_data(api, elec_account, start_date, end_date)
            
            # Collect forecast data  
            forecast_data = await collect_coned_forecast_data(api)
            
            if not usage_data:
                print("No usage data collected")
                return {"status": "no_data", "usage_data": [], "forecast_data": []}
            
            print(f"Successfully collected {len(usage_data)} usage data points")
            print(f"Successfully collected {len(forecast_data)} forecast records")
            
            return {
                "status": "success",
                "usage_data": usage_data,
                "forecast_data": forecast_data,
                "metadata": {
                    "collection_date": datetime.now().isoformat(),
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "total_records": len(usage_data)
                }
            }
            
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            return {"status": "error", "error": str(e), "usage_data": [], "forecast_data": []}