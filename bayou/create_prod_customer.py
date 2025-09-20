#!/usr/bin/env python3
"""
Create a ConEd customer on Bayou production
"""

import requests
import json
import os
import time
from dotenv import load_dotenv

load_dotenv('../.env.local')

api_key = os.getenv('BAYOU_API_KEY_PROD')
domain = "bayou.energy"
base_url = f"https://{domain}/api/v2"

print(f"Creating ConEd customer on PRODUCTION...")

# Create a ConEd customer
response = requests.post(
    f"{base_url}/customers",
    json={
        "utility": "con_edison",
        "email": f"coned_prod_{int(time.time())}@example.com"
    },
    auth=(api_key, '')
)

if response.status_code in [200, 201]:
    customer = response.json()
    print(f"\n✅ Customer created successfully!")
    print(f"Customer ID: {customer['id']}")
    print(f"Onboarding Link: {customer['onboarding_link']}")
    print(f"\nTo get bills, run:")
    print(f"python bayou/get_bills.py {customer['id']} --prod")
else:
    print(f"❌ Failed to create customer: {response.status_code}")
    print(response.text)