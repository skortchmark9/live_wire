#!/usr/bin/env python3
"""
Test script for ConEd authentication with interactive MFA
"""
import asyncio
import aiohttp
import sys
import getpass
from pathlib import Path

# Add opower to path
sys.path.insert(0, str(Path(__file__).parent / "opower" / "src"))
from opower import Opower, AggregateType
from datetime import datetime, timedelta

async def test_coned_login():
    username = input("Enter ConEd username: ")
    password = getpass.getpass("Enter ConEd password: ")
    
    print(f"Testing login for user: {username}")
    
    # Create MFA callback that waits for user input
    async def mfa_callback():
        print("\n🔐 MFA Required!")
        mfa_code = input("Enter your 6-digit MFA code: ")
        print(f"Using MFA code: {mfa_code}")
        return mfa_code
    
    try:
        async with aiohttp.ClientSession() as session:
            print("Creating Opower API instance...")
            api = Opower(session, "coned", username, password, None)
            
            print("Starting login process...")
            await api.async_login(mfa_callback=mfa_callback)
            
            print("✅ Login successful!")
            print(f"Access token: {api.access_token[:20]}..." if api.access_token else "No access token")

            forecasts = await api.async_get_forecast()
            print(forecasts)

            # Try to get account info to verify authentication
            print("\nTesting API call...")
            accounts = await api.async_get_accounts()
            print(f"Found {len(accounts)} accounts")

            elec_account = None
            for account in accounts:
                if account.meter_type.value == 'ELEC' and account.read_resolution and 'QUARTER' in account.read_resolution.value:
                    elec_account = account
                    break

            usage_reads = await api.async_get_usage_reads(
                elec_account,
                AggregateType.BILL,
                # start_date=datetime.now() - timedelta(days=30),
                # end_date=datetime.now()
            )
            last_bill = usage_reads[-1]
            print(f"Last bill start date: {last_bill.start_time}, end date: {last_bill.end_time}")

                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("ConEd Authentication Test")
    print("=" * 30)
    asyncio.run(test_coned_login())