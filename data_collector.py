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

# Add opower to path
sys.path.insert(0, str(Path(__file__).parent / "opower" / "src"))

from opower import Opower, AggregateType, ReadResolution


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
            
        return all_data


async def main():
    # Configuration - you'll need to update these
    USERNAME = "samkortchmar@gmail.com"
    PASSWORD = os.getenv("CONED_PASSWORD") or input("ConEd Password: ")
    TOTP_SECRET = "QFBUCOQ5UJWQJVF6"  # From your example
    
    # Date range - adjust as needed
    # Start from when you moved in (you can adjust this date)
    START_DATE = date(2024, 8, 1)  # Adjust to your move-in date
    END_DATE = date.today()
    
    print(f"Collecting electricity data from {START_DATE} to {END_DATE}")
    
    try:
        data = await collect_electricity_data(USERNAME, PASSWORD, TOTP_SECRET, START_DATE, END_DATE)
        
        # Save to JSON file
        output_file = Path("electricity-tracker/public/data/electricity_usage.json")
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_file, 'w') as f:
            json.dump({
                "metadata": {
                    "collection_date": datetime.now().isoformat(),
                    "start_date": START_DATE.isoformat(),
                    "end_date": END_DATE.isoformat(),
                    "total_records": len(data)
                },
                "data": data
            }, f, indent=2)
        
        print(f"Successfully collected {len(data)} data points")
        print(f"Data saved to {output_file}")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())