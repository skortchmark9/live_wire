"""
ConEd API Client Module
"""
import asyncio
import aiohttp
import sys
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple

# Add opower to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "opower" / "src"))
from opower import Opower, AggregateType


class ConEdClient:
    """Client for fetching data from ConEd API"""
    
    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.api = None
        self.session = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def authenticate(self, mfa_callback=None):
        """Authenticate with ConEd"""
        if not mfa_callback:
            # Default MFA callback for CLI
            async def default_mfa():
                print("\n🔐 MFA Required!")
                mfa_code = input("Enter your 6-digit MFA code: ")
                return mfa_code
            mfa_callback = default_mfa
            
        print("Creating Opower API instance...")
        self.api = Opower(self.session, "coned", self.username, self.password, None)
        
        print("Starting login process...")
        await self.api.async_login(mfa_callback=mfa_callback)
        print("✅ Login successful!")
        
    async def get_electric_account(self) -> Tuple[any, str]:
        """Get electric account with 15-minute interval capability"""
        print("\nFetching accounts...")
        accounts = await self.api.async_get_accounts()
        print(f"Found {len(accounts)} accounts")
        
        for account in accounts:
            if (account.meter_type.value == 'ELEC' and 
                account.read_resolution and 
                'QUARTER' in account.read_resolution.value):
                print(f"Using electric account: {account.id}")
                return account, account.id
                
        raise Exception("No electric account with 15-minute interval capability found")
    
    async def fetch_usage_data(self, account, start_date: datetime, end_date: datetime) -> List[Dict]:
        """Fetch 15-minute interval usage data"""
        print(f"\nFetching 15-minute interval data from {start_date.date()} to {end_date.date()}...")
        
        data_points = []
        current_start = start_date
        chunk_days = 30  # Fetch 30 days at a time
        
        while current_start < end_date:
            current_end = min(current_start + timedelta(days=chunk_days), end_date)
            
            print(f"Fetching chunk: {current_start.date()} to {current_end.date()}")
            
            usage_reads = await self.api.async_get_usage_reads(
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
            
            print(f"  Fetched {len(usage_reads)} readings")
            current_start = current_end + timedelta(days=1)
        
        print(f"\n✅ Total data points fetched: {len(data_points)}")
        return data_points