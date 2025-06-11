#!/usr/bin/env python3
"""
Data collector for ConEd electricity usage data using opower library.
Collects historical data at 15-minute intervals.
"""

import json
import sys
import os
import asyncio
import aiohttp
from datetime import datetime, timedelta, date
from pathlib import Path
import pytz

# Add opower to path
sys.path.insert(0, str(Path(__file__).parent / "opower" / "src"))

from opower import Opower, AggregateType, ReadResolution


def get_last_timestamp_from_file(file_path: Path) -> datetime:
    """
    Get the latest timestamp from existing data file with non-null consumption.
    
    Args:
        file_path: Path to existing electricity usage JSON file
        
    Returns:
        Latest end_time with non-null consumption_kwh as datetime, or None if file doesn't exist or is empty
    """
    if not file_path.exists():
        return None
        
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
            
        if not data.get('data'):
            return None
            
        # Find the last record with non-null consumption_kwh
        last_record = None
        for record in reversed(data['data']):
            if record['consumption_kwh'] is not None and record['consumption_kwh'] > 0:
                last_record = record
                break
        
        if not last_record:
            return None
            
        last_timestamp = datetime.fromisoformat(last_record['end_time'])
        
        # Convert to naive datetime in UTC if it has timezone info
        if last_timestamp.tzinfo:
            last_timestamp = last_timestamp.astimezone(pytz.UTC).replace(tzinfo=None)
            
        return last_timestamp
        
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        print(f"Error reading existing data: {e}")
        return None


def merge_and_save_data(existing_data: list, new_data: list, output_file: Path):
    """
    Merge new data with existing data and save to file.
    
    Args:
        existing_data: List of existing data points
        new_data: List of new data points to append
        output_file: Path to save merged data
    """
    # Create set of existing timestamps for deduplication
    existing_timestamps = {item['start_time'] for item in existing_data}
    
    # Filter out duplicates from new data
    filtered_new_data = [
        item for item in new_data 
        if item['start_time'] not in existing_timestamps
    ]
    
    # Merge and sort by start_time
    all_data = existing_data + filtered_new_data
    all_data.sort(key=lambda x: x['start_time'])
    
    # Save merged data
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, 'w') as f:
        json.dump({
            "metadata": {
                "collection_date": datetime.now().isoformat(),
                "start_date": all_data[0]['start_time'][:10] if all_data else None,
                "end_date": all_data[-1]['end_time'][:10] if all_data else None,
                "total_records": len(all_data)
            },
            "data": all_data
        }, f, indent=2)
    
    return len(filtered_new_data)


async def collect_electricity_data(username: str, password: str, totp_secret: str, start_date: date, end_date: date):
    """
    Collect electricity usage data from ConEd using opower API.
    
    Args:
        username: ConEd username
        password: ConEd password  
        totp_secret: 2FA TOTP secret
        start_date: Start date for data collection
        end_date: End date for data collection
    
    Returns:
        List of usage data points
    """
    
    async with aiohttp.ClientSession() as session:
        # Initialize opower client with utility name as string
        api = Opower(session, "coned", username, password, totp_secret)
        
        # Login first
        await api.async_login()
        
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
            
        return all_data


async def main():
    # Configuration - you'll need to update these
    USERNAME = "samkortchmar@gmail.com"
    PASSWORD = os.getenv("CONED_PASSWORD") or input("ConEd Password: ")
    TOTP_SECRET = "QFBUCOQ5UJWQJVF6"  # From your example
    
    # Output file path
    output_file = Path("electricity-tracker/public/data/electricity_usage.json")
    
    # Check for existing data and determine start date
    last_timestamp = get_last_timestamp_from_file(output_file)
    
    if last_timestamp:
        # Start from the last timestamp + 15 minutes to avoid duplicates
        START_DATE = (last_timestamp + timedelta(minutes=15)).date()
        print(f"Found existing data up to {last_timestamp}")
        print(f"Starting incremental collection from {START_DATE}")
    else:
        # No existing data, start from move-in date
        START_DATE = date(2024, 8, 1)  # Adjust to your move-in date
        print(f"No existing data found. Starting fresh collection from {START_DATE}")
    
    # Set end date to get most recent data (current time for live data)
    # Add a small buffer to ensure we get the latest available data
    END_DATE = datetime.now().date() + timedelta(days=1)
    
    # Skip collection if start date is after end date (no new data to collect)
    if START_DATE > END_DATE:
        print("No new data to collect. Data is up to date.")
        return
    
    print(f"Collecting electricity data from {START_DATE} to {END_DATE}")
    
    try:
        new_data = await collect_electricity_data(USERNAME, PASSWORD, TOTP_SECRET, START_DATE, END_DATE)
        
        if not new_data:
            print("No new data collected")
            return
        
        # Load existing data if it exists
        existing_data = []
        if output_file.exists():
            try:
                with open(output_file, 'r') as f:
                    existing_file_data = json.load(f)
                    existing_data = existing_file_data.get('data', [])
            except (json.JSONDecodeError, KeyError):
                print("Warning: Could not read existing data file, starting fresh")
                existing_data = []
        
        # Merge and save data
        new_records_count = merge_and_save_data(existing_data, new_data, output_file)
        
        total_records = len(existing_data) + new_records_count
        print(f"Successfully collected {new_records_count} new data points")
        print(f"Total records in dataset: {total_records}")
        print(f"Data saved to {output_file}")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())