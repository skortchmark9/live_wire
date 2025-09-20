#!/usr/bin/env python3
"""
Bayou API Explorer
Interactive script to explore various Bayou API endpoints
"""

import requests
import json
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv('../.env.local')

class BayouAPIExplorer:
    def __init__(self):
        self.api_key = os.getenv('BAYOU_API_KEY')
        self.environment = os.getenv('BAYOU_ENVIRONMENT', 'staging')
        self.domain = "bayou.energy" if self.environment == "production" else "staging.bayou.energy"
        self.base_url = f"https://{self.domain}/api/v2"
        self.session = requests.Session()
        self.session.auth = (self.api_key, '')

    def explore_utilities(self):
        """Explore supported utilities"""
        print("\n=== Supported Utilities ===")

        # Common utility codes based on documentation
        utilities = [
            "speculoos_power",  # Test utility
            "coned",            # ConEd
            "pge",              # Pacific Gas & Electric
            "sce",              # Southern California Edison
            "sdge",             # San Diego Gas & Electric
            "duke",             # Duke Energy
            "georgia_power",    # Georgia Power
            "fpl",              # Florida Power & Light
        ]

        print("Testing utility support...")
        supported = []

        for utility in utilities:
            # Try creating a customer with each utility
            response = self.session.post(
                f"{self.base_url}/customers",
                json={"utility": utility}
            )

            if response.status_code in [200, 201]:
                supported.append(utility)
                print(f"  ✓ {utility}")
                # Delete test customer
                customer_id = response.json().get('id')
                if customer_id:
                    self.session.delete(f"{self.base_url}/customers/{customer_id}")
            else:
                print(f"  ✗ {utility} - {response.status_code}")

        return supported

    def explore_customer_endpoints(self):
        """Explore customer-related endpoints"""
        print("\n=== Customer Endpoints ===")

        endpoints = [
            ("GET", "/customers", "List all customers"),
            ("POST", "/customers", "Create a customer"),
            ("GET", "/customers/{id}", "Get customer details"),
            ("PUT", "/customers/{id}", "Update customer"),
            ("DELETE", "/customers/{id}", "Delete customer"),
            ("GET", "/customers/{id}/bills", "Get customer bills"),
            ("GET", "/customers/{id}/intervals", "Get interval data"),
            ("GET", "/customers/{id}/accounts", "Get utility accounts"),
            ("POST", "/customers/{id}/refresh", "Refresh customer data"),
        ]

        for method, endpoint, description in endpoints:
            print(f"\n{method:6} {endpoint:40} - {description}")

            # Test endpoint availability
            if "{id}" not in endpoint:
                if method == "GET":
                    response = self.session.get(f"{self.base_url}{endpoint}")
                    print(f"       Status: {response.status_code}")
                elif method == "POST" and endpoint == "/customers":
                    # Skip creating customers in this exploration
                    print(f"       Status: Available (not tested)")

    def explore_webhook_endpoints(self):
        """Explore webhook configuration"""
        print("\n=== Webhook Configuration ===")

        # Get webhook config
        response = self.session.get(f"{self.base_url}/webhooks")

        if response.status_code == 200:
            print(f"Current webhook configuration:")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"Webhook endpoint status: {response.status_code}")

        # List available webhook events
        print("\nAvailable webhook events (from documentation):")
        events = [
            "customer_has_filled_credentials",
            "bills_ready",
            "intervals_ready",
            "customer_created",
            "customer_updated",
            "customer_deleted",
            "authentication_failed",
            "data_refresh_completed",
        ]

        for event in events:
            print(f"  • {event}")

    def explore_data_formats(self):
        """Explore data formats returned by the API"""
        print("\n=== Data Formats ===")

        print("\nBill Data Structure:")
        print("""
        {
            "id": "bill_123",
            "customer_id": "cust_456",
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
            "amount_cents": 15000,
            "usage_kwh": 450,
            "status": "paid",
            "due_date": "2024-02-15",
            "service_address": "123 Main St",
            "meter_number": "MTR123456"
        }
        """)

        print("\nInterval Data Structure:")
        print("""
        {
            "meters": [
                {
                    "id": "meter_123",
                    "number": "MTR123456",
                    "intervals": [
                        {
                            "start_time": "2024-01-01T00:00:00Z",
                            "end_time": "2024-01-01T01:00:00Z",
                            "usage_kwh": 1.5,
                            "quality": "actual"
                        }
                    ]
                }
            ]
        }
        """)

    def test_authentication(self):
        """Test API authentication"""
        print("\n=== Testing Authentication ===")

        # Test with current credentials
        response = self.session.get(f"{self.base_url}/customers")

        if response.status_code == 200:
            print(f"✓ Authentication successful")
            customers = response.json()
            print(f"  Found {len(customers)} customers in account")
        elif response.status_code == 401:
            print(f"✗ Authentication failed - check API key")
        else:
            print(f"? Unexpected status: {response.status_code}")

    def run_exploration(self):
        """Run complete API exploration"""
        print("=" * 60)
        print("BAYOU API EXPLORER")
        print(f"Environment: {self.environment} ({self.domain})")
        print(f"Timestamp: {datetime.now().isoformat()}")
        print("=" * 60)

        if not self.api_key:
            print("\n⚠️  Error: BAYOU_API_KEY not found in environment")
            print("Please add BAYOU_API_KEY to your .env.local file")
            return

        # Test authentication first
        self.test_authentication()

        # Explore various aspects of the API
        self.explore_customer_endpoints()
        self.explore_utilities()
        self.explore_webhook_endpoints()
        self.explore_data_formats()

        print("\n" + "=" * 60)
        print("EXPLORATION COMPLETE")
        print("=" * 60)
        print("\nNext steps:")
        print("1. Run quickstart.py for the full QuickStart flow")
        print("2. Run test_coned_integration.py to test with ConEd")
        print("3. Check https://docs.bayou.energy for full documentation")

if __name__ == "__main__":
    explorer = BayouAPIExplorer()
    explorer.run_exploration()