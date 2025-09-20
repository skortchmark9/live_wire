#!/usr/bin/env python3
"""
Bayou API - ConEd Integration Test
Tests the Bayou API with ConEd utility specifically
"""

import requests
import time
import json
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv('../.env.local')

class BayouConEdTester:
    def __init__(self):
        self.api_key = os.getenv('BAYOU_API_KEY')
        self.environment = os.getenv('BAYOU_ENVIRONMENT', 'staging')
        self.domain = "bayou.energy" if self.environment == "production" else "staging.bayou.energy"
        self.base_url = f"https://{self.domain}/api/v2"

    def create_coned_customer(self, email=None):
        """Create a customer with ConEd utility"""
        print("\n=== Creating ConEd Customer ===")

        payload = {
            "utility": "con_edison",  # ConEd utility code
        }

        if email:
            payload["email"] = email

        response = requests.post(
            f"{self.base_url}/customers",
            json=payload,
            auth=(self.api_key, '')
        )

        if response.status_code == 201 or response.status_code == 200:
            customer = response.json()
            print(f"✓ Customer created successfully")
            print(f"  ID: {customer.get('id')}")
            print(f"  Utility: {customer.get('utility')}")
            print(f"  Onboarding Link: {customer.get('onboarding_link')}")
            return customer
        else:
            print(f"✗ Failed to create customer: {response.status_code}")
            print(f"  Response: {response.text}")
            return None

    def get_customer_status(self, customer_id):
        """Check customer authentication and data status"""
        response = requests.get(
            f"{self.base_url}/customers/{customer_id}",
            auth=(self.api_key, '')
        )

        if response.status_code == 200:
            return response.json()
        return None

    def wait_for_authentication(self, customer_id, timeout=300):
        """Wait for customer to authenticate (with timeout)"""
        print("\n=== Waiting for Customer Authentication ===")
        print("Please complete the onboarding form with ConEd credentials...")

        start_time = time.time()
        while time.time() - start_time < timeout:
            customer = self.get_customer_status(customer_id)

            if customer and customer.get("has_filled_credentials"):
                print("\n✓ Customer has authenticated!")
                return customer

            print(".", end="", flush=True)
            time.sleep(5)

        print("\n✗ Timeout waiting for authentication")
        return None

    def get_bills(self, customer_id):
        """Fetch customer bills"""
        print("\n=== Fetching ConEd Bills ===")

        # First check if bills are ready
        customer = self.get_customer_status(customer_id)

        if not customer.get("bills_are_ready"):
            print("Waiting for bills to be ready...")
            start_time = time.time()
            timeout = 120

            while time.time() - start_time < timeout:
                customer = self.get_customer_status(customer_id)
                if customer.get("bills_are_ready"):
                    break
                print(".", end="", flush=True)
                time.sleep(3)

        response = requests.get(
            f"{self.base_url}/customers/{customer_id}/bills",
            auth=(self.api_key, '')
        )

        if response.status_code == 200:
            bills = response.json()
            print(f"\n✓ Retrieved {len(bills)} bills")

            # Display summary of recent bills
            if bills:
                print("\nRecent Bills Summary:")
                print("-" * 60)
                for bill in bills[:5]:  # Show last 5 bills
                    print(f"Period: {bill.get('start_date')} to {bill.get('end_date')}")
                    print(f"  Amount: ${bill.get('amount_cents', 0) / 100:.2f}")
                    print(f"  Usage: {bill.get('usage_kwh')} kWh")
                    print(f"  Status: {bill.get('status')}")
                    print()

            return bills
        else:
            print(f"✗ Failed to fetch bills: {response.status_code}")
            return None

    def get_intervals(self, customer_id):
        """Fetch customer interval data"""
        print("\n=== Fetching ConEd Interval Data ===")

        # First check if intervals are ready
        customer = self.get_customer_status(customer_id)

        if not customer.get("intervals_are_ready"):
            print("Waiting for intervals to be ready...")
            start_time = time.time()
            timeout = 120

            while time.time() - start_time < timeout:
                customer = self.get_customer_status(customer_id)
                if customer.get("intervals_are_ready"):
                    break
                print(".", end="", flush=True)
                time.sleep(3)

        response = requests.get(
            f"{self.base_url}/customers/{customer_id}/intervals",
            auth=(self.api_key, '')
        )

        if response.status_code == 200:
            intervals = response.json()
            print(f"\n✓ Retrieved interval data")

            # Display summary
            if intervals.get("meters"):
                for meter in intervals["meters"]:
                    meter_intervals = meter.get("intervals", [])
                    if meter_intervals:
                        print(f"\nMeter {meter.get('id')}:")
                        print(f"  Total intervals: {len(meter_intervals)}")

                        # Show sample of recent intervals
                        print("  Recent intervals (first 5):")
                        for interval in meter_intervals[:5]:
                            print(f"    {interval.get('start_time')}: {interval.get('usage_kwh')} kWh")

            return intervals
        else:
            print(f"✗ Failed to fetch intervals: {response.status_code}")
            return None

    def test_webhook_endpoints(self):
        """Test webhook configuration endpoints"""
        print("\n=== Testing Webhook Endpoints ===")

        # Get current webhook configuration
        response = requests.get(
            f"{self.base_url}/webhooks",
            auth=(self.api_key, '')
        )

        if response.status_code == 200:
            webhooks = response.json()
            print(f"✓ Current webhooks: {webhooks}")
        else:
            print(f"✗ Failed to get webhooks: {response.status_code}")

    def run_full_test(self):
        """Run complete ConEd integration test"""
        print("=" * 60)
        print("BAYOU API - CONED INTEGRATION TEST")
        print(f"Environment: {self.environment} ({self.domain})")
        print(f"Timestamp: {datetime.now().isoformat()}")
        print("=" * 60)

        if not self.api_key:
            print("\n⚠️  Error: BAYOU_API_KEY not found in environment")
            print("Please add BAYOU_API_KEY to your .env.local file")
            return

        # Create a ConEd customer
        customer = self.create_coned_customer(email=f"coned_test_{int(time.time())}@example.com")

        if not customer:
            print("\nTest failed: Could not create customer")
            return

        customer_id = customer['id']

        print(f"\n{'='*60}")
        print("IMPORTANT: Manual Action Required!")
        print(f"{'='*60}")
        print(f"Please visit: {customer['onboarding_link']}")
        print("And authenticate with your ConEd credentials")
        print(f"{'='*60}\n")

        # Wait for authentication
        authenticated_customer = self.wait_for_authentication(customer_id)

        if authenticated_customer:
            # Fetch bills
            bills = self.get_bills(customer_id)

            # Fetch intervals
            intervals = self.get_intervals(customer_id)

            # Test webhooks
            self.test_webhook_endpoints()

            print("\n" + "=" * 60)
            print("TEST COMPLETE")
            print("=" * 60)
            print(f"Customer ID: {customer_id}")
            print(f"Bills Retrieved: {len(bills) if bills else 0}")
            print(f"Intervals Retrieved: {len(intervals.get('meters', [])) if intervals else 0} meters")
        else:
            print("\nTest incomplete: Customer did not authenticate")

if __name__ == "__main__":
    tester = BayouConEdTester()
    tester.run_full_test()