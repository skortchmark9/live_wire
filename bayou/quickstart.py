#!/usr/bin/env python3
"""
Bayou API QuickStart - Following Official Documentation
This script follows the exact QuickStart guide from Bayou
"""

import requests
import time
import os
from dotenv import load_dotenv

load_dotenv('../.env.local')

# Bayou has two environments, staging and production
# For testing, we'll use staging as shown in the QuickStart
bayou_domain = "staging.bayou.energy"  # Change to "bayou.energy" for production

# Get API key from environment
bayou_api_key = os.getenv('BAYOU_API_KEY', 'your key here')

print(f"""
========================================
BAYOU API QUICKSTART TEST
========================================
Environment: {bayou_domain}
API Key: {bayou_api_key[:10]}...
========================================
""")

# Step 1: Create a new customer
print("\nStep 1: Creating a test customer with Speculoos (fake utility)...")
customer = requests.post(f"https://{bayou_domain}/api/v2/customers", json={
    "utility": "speculoos_power",  # Speculoos is Bayou's fake utility for testing
    "email": "QuickStart@bayou.energy"  # Email address isn't required
}, auth=(bayou_api_key, '')).json()

print(f"Customer created! ID: {customer.get('id')}")

# Step 2: Provide onboarding link
print(f"""
Step 2: Complete the customer form
=====================================
Visit this link: {customer['onboarding_link']}

Test Credentials:
- Email: iamvalid@bayou.energy
- Password: validpassword

Waiting for you to complete the form...
""")

# Step 3: Wait for customer to fill credentials
while not customer["has_filled_credentials"]:
    time.sleep(3)
    customer = requests.get(
        f"https://{bayou_domain}/api/v2/customers/{customer['id']}",
        auth=(bayou_api_key, '')
    ).json()
    print(".", end="", flush=True)

print("\n✓ Customer has filled credentials!")

# Step 4: Fetch bills
print("\nStep 3: Fetching bill data...")
time.sleep(3)

while not customer["bills_are_ready"]:
    time.sleep(3)
    customer = requests.get(
        f"https://{bayou_domain}/api/v2/customers/{customer['id']}",
        auth=(bayou_api_key, '')
    ).json()
    print(".", end="", flush=True)

print("\n✓ Bills are ready!")

# Get all bills for the customer
bills = requests.get(
    f"https://{bayou_domain}/api/v2/customers/{customer['id']}/bills",
    auth=(bayou_api_key, '')
).json()

# Display first 12 bills
print(f"\nShowing first 12 bills (out of {len(bills)} total):")
print("-" * 80)
for i, bill in enumerate(bills[:12], 1):
    print(f"Bill {i}: {bill}")

time.sleep(10)  # Pause to review bill data

# Step 5: Fetch interval data
print("\nStep 4: Fetching interval data...")
time.sleep(3)

while not customer["intervals_are_ready"]:
    time.sleep(3)
    customer = requests.get(
        f"https://{bayou_domain}/api/v2/customers/{customer['id']}",
        auth=(bayou_api_key, '')
    ).json()
    print(".", end="", flush=True)

print("\n✓ Intervals are ready!")

# Get all intervals for the customer
intervals = requests.get(
    f"https://{bayou_domain}/api/v2/customers/{customer['id']}/intervals",
    auth=(bayou_api_key, '')
).json()

# Display first 10 intervals for each meter
for meter in intervals["meters"]:
    print(f"\nIntervals for meter {meter['id']}:")
    print("-" * 80)
    for interval in meter["intervals"][:10]:
        print(interval)

time.sleep(10)  # Pause to review interval data

print("""
========================================
QUICKSTART COMPLETE! 🎉
========================================

You're ready to get customer utility data instantly with Bayou!

Next steps:
1. Review the full API documentation: https://docs.bayou.energy/v2.0/reference
2. Set up webhooks for production: https://docs.bayou.energy/v2.0/reference/how-to-set-up-webhooks
3. Integrate with your application: https://docs.bayou.energy/docs/merge-customer-code-with-your-project

For support:
- Documentation: https://docs.bayou.energy
- Book a call: https://calendly.com/jamesbayouenergy/30min
- Text James (CEO): +1 504 722 8987
""")