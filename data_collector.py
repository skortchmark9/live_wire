#!/usr/bin/env python3
"""
Data collector for ConEd electricity usage data using opower library.
Collects historical data at 15-minute intervals.
"""

import asyncio
import os
import sys
from pathlib import Path

# Import the electricity collector module
from data_collectors.electricity_collector import collect_electricity_data_full


async def main():
    # Configuration - you'll need to update these
    USERNAME = "samkortchmar@gmail.com"
    PASSWORD = os.getenv("CONED_PASSWORD") or input("ConEd Password: ")
    TOTP_SECRET = "QFBUCOQ5UJWQJVF6"  # From your example
    
    # Output directory
    output_dir = Path("electricity-tracker/public/data")
    
    try:
        result = await collect_electricity_data_full(USERNAME, PASSWORD, TOTP_SECRET, output_dir)
        
        if result["status"] == "success":
            print(f"✅ Collection completed successfully!")
            print(f"New records: {result['new_records']}")
            print(f"Total records: {result['total_records']}")
            print(f"Usage data: {result['usage_file']}")
            print(f"Forecast data: {result['forecast_file']}")
        elif result["status"] == "up_to_date":
            print("✅ Data is already up to date!")
        elif result["status"] == "no_new_data":
            print("✅ No new data available to collect")
        else:
            print(f"❌ Collection failed: {result.get('error', 'Unknown error')}")
            sys.exit(1)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())