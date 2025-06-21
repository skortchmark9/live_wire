#!/usr/bin/env python3
"""
Test script for ConEd authentication with interactive MFA
"""
import asyncio
import aiohttp
import sys
from pathlib import Path

# Add opower to path
sys.path.insert(0, str(Path(__file__).parent / "opower" / "src"))
from opower import Opower

async def test_coned_login():
    username = input("Enter ConEd username: ")
    password = input("Enter ConEd password: ")
    
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
            
            # Try to get account info to verify authentication
            print("\nTesting API call...")
            accounts = await api.async_get_accounts()
            print(f"Found {len(accounts)} accounts")
            for account in accounts:
                print(f"  Account: {account}")
                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("ConEd Authentication Test")
    print("=" * 30)
    asyncio.run(test_coned_login())