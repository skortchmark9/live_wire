#!/usr/bin/env python3
"""
Simple test script for ConEd browser automation - browser only
"""
import asyncio
import sys
import getpass
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

# Add path for browser automation
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from browser_automation.coned_browser import ConEdBrowserAutomation


async def test_browser_login():
    # Use demo credentials from .env.local
    username = os.getenv('DEMO_CONED_USERNAME')
    password = os.getenv('DEMO_CONED_PASSWORD')

    if not username or not password:
        print("⚠️  Demo credentials not found in .env.local, falling back to manual input")
        username = input("Enter ConEd username: ")
        password = getpass.getpass("Enter ConEd password: ")
    else:
        print(f"Using demo credentials for: {username}")

    print(f"\nTesting browser login for user: {username}")
    print("=" * 50)

    # Create MFA callback that waits for user input
    async def mfa_callback():
        print("\n🔐 MFA Required!")
        mfa_code = input("Enter your 6-digit MFA code: ")
        print(f"Using MFA code: {mfa_code}")
        return mfa_code

    browser = None
    try:
        print("Initializing browser...")
        browser = ConEdBrowserAutomation(download_dir="./coned_downloads")

        # Set headless=False so we can see what's happening
        await browser.initialize(headless=False)

        print("Starting login process...")
        print("Browser window should open now...")

        login_success = await browser.login(username, password, mfa_callback)

        if login_success:
            print("✅ Login successful!")

            # Wait for page to load
            print("Waiting for account page to load...")
            await asyncio.sleep(3)

            # Take a screenshot of the bills page
            screenshot = await browser.take_screenshot("bills_page")
            print(f"Screenshot saved: {screenshot}")

            # Try to download a bill
            print("\nAttempting to download recent bill...")
            bill_path = await browser.download_recent_bill()

            if bill_path:
                print(f"✅ Bill successfully downloaded to: {bill_path}")
            else:
                print("⚠️ Could not download bill (may need to adjust selectors)")

            # Take final screenshot
            await browser.take_screenshot("final_state")

            print("\n✅ Test completed successfully!")
        else:
            print("❌ Login failed")
            print("Check the screenshots in ./coned_downloads for debugging")

    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()

        if browser and browser.page:
            # Try to take a screenshot for debugging
            await browser.take_screenshot("error_state")

    finally:
        if browser:
            print("\nKeeping browser open for 15 seconds for inspection...")
            print("You can interact with the page to see the current state")
            await asyncio.sleep(15)

            print("Closing browser...")
            await browser.close()


if __name__ == "__main__":
    print("ConEd Browser Automation Test (Browser Only)")
    print("=" * 60)
    print("This will open a browser window and attempt to log in to ConEd")
    print("You will be able to see the browser automation in action")
    print("-" * 60)

    asyncio.run(test_browser_login())