"""
ConEd browser automation module for downloading bills
"""
import asyncio
import os
from pathlib import Path
from typing import Optional, Callable
from playwright.async_api import async_playwright, Browser, Page
from datetime import datetime


class ConEdBrowserAutomation:
    def __init__(self, download_dir: str = None):
        self.download_dir = download_dir or str(Path.home() / "Downloads" / "coned_bills")
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.playwright = None

        # Create download directory if it doesn't exist
        Path(self.download_dir).mkdir(parents=True, exist_ok=True)

    async def initialize(self, headless: bool = False):
        """Initialize browser instance"""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=headless,
            args=['--disable-blink-features=AutomationControlled']
        )

        # Create context with download handling
        context = await self.browser.new_context(
            accept_downloads=True,
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )

        self.page = await context.new_page()



    async def login(self, username: str, password: str, mfa_callback: Optional[Callable] = None):
        """Login to ConEd portal"""
        if not self.page:
            raise RuntimeError("Browser not initialized. Call initialize() first.")

        try:
            print("Navigating to ConEd login page...")
            await self.page.goto('https://www.coned.com/en/login', wait_until='networkidle')

            # Wait for login form to load
            await self.page.wait_for_selector('input[name="LoginEmail"]', timeout=10000)

            print("Entering credentials...")
            # Use the specific ConEd form field names - using type() for better JS compatibility
            await self.page.type('input[name="LoginEmail"]', username, delay=50)
            print("Typed username/email field")

            await self.page.type('input[name="LoginPassword"]', password, delay=50)
            print("Typed password field")

            # Click the submit button
            await self.page.click('button[type="submit"]')
            print("Clicked login button")

            # Wait briefly for navigation or MFA prompt
            await asyncio.sleep(1)

            # Check if MFA is required by looking for the MFA input field
            mfa_field = 'input[name="LoginMFACode"]'

            try:
                # Wait a bit to see if MFA field appears
                await self.page.wait_for_selector(mfa_field, timeout=5000)

                if mfa_callback:
                    print("MFA required, waiting for code...")
                    mfa_code = await mfa_callback()

                    print(f"Entering MFA code: {mfa_code}")
                    await self.page.type(mfa_field, mfa_code, delay=50)

                    # Wait for MFA to process
                    await asyncio.sleep(1)

                    # Submit MFA code
                    await self.page.click('.js-login-new-device-form button[type="submit"]')
                    print("Submitted MFA code")

            except asyncio.TimeoutError:
                print("No MFA required, proceeding...")

            return True

        except Exception as e:
            print(f"❌ Login failed: {e}")
            # Take a screenshot for debugging
            screenshot_path = os.path.join(self.download_dir, f"login_error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
            await self.page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to: {screenshot_path}")
            return False


    async def download_recent_bill(self):
        """Download the most recent bill"""
        try:
            print("Looking for View Current Bill PDF button...")

            # Use the specific selector for the ConEd bill download button
            bill_link_selector = '[data-module="ViewCurrentBill"] .js-bill-link, [data-module="ViewCurrentBill"].js-bill-link'

            try:
                # Wait for page to fully load after login
                await self.page.wait_for_load_state('networkidle')

                # Wait for the bill link to be available and visible
                await self.page.wait_for_selector(bill_link_selector, state='visible', timeout=10000)

                # Ensure the element is attached to DOM and ready
                await self.page.wait_for_function(
                    f"document.querySelector('{bill_link_selector}') && document.querySelector('{bill_link_selector}').offsetParent !== null"
                )

                # Set up to capture the new tab that will open
                async with self.page.context.expect_page() as new_page_info:
                    # Click the bill link which opens in a new tab
                    await self.page.click(bill_link_selector)
                    print("Clicked View Current Bill PDF button")

                    # Get the new page/tab
                    new_page = await new_page_info.value
                    print("New tab opened with PDF")

                    # Wait for the PDF URL to load (should change from about:blank)
                    await new_page.wait_for_function(
                        "window.location.href && !window.location.href.startsWith('about:')",
                        timeout=10000
                    )

                    # Wait for the PDF to fully load
                    await new_page.wait_for_load_state('networkidle')

                    pdf_url = new_page.url
                    print(f"PDF URL: {pdf_url}")

                    # Use the authenticated context to download the PDF
                    response = await self.page.context.request.get(pdf_url)
                    pdf_content = await response.body()

                    # Save the PDF
                    filename = f"coned_bill_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
                    filepath = os.path.join(self.download_dir, filename)

                    with open(filepath, 'wb') as f:
                        f.write(pdf_content)

                    print(f"✅ Downloaded bill to: {filepath}")

                    # Close the new tab
                    await new_page.close()

                    return filepath

            except asyncio.TimeoutError:
                print("❌ Could not find View Current Bill button")
                # Take screenshot for debugging
                screenshot_path = os.path.join(self.download_dir, f"bills_page_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
                await self.page.screenshot(path=screenshot_path)
                print(f"Screenshot saved to: {screenshot_path}")
                return None

        except Exception as e:
            print(f"❌ Failed to download bill: {e}")
            # Take screenshot for debugging
            screenshot_path = os.path.join(self.download_dir, f"download_error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
            await self.page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to: {screenshot_path}")
            return None

    async def close(self):
        """Clean up browser resources"""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        print("Browser closed.")

    async def take_screenshot(self, name: str = "screenshot"):
        """Take a screenshot for debugging"""
        if self.page:
            screenshot_path = os.path.join(self.download_dir, f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
            await self.page.screenshot(path=screenshot_path, full_page=True)
            print(f"Screenshot saved to: {screenshot_path}")
            return screenshot_path
        return None