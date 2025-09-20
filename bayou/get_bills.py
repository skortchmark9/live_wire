#!/usr/bin/env python3
"""
Simple script to get bills from Bayou API and output JSON
"""

import requests
import json
import os
import sys
from dotenv import load_dotenv
import pathlib

# Load .env.local from parent directory
env_path = pathlib.Path(__file__).parent.parent / '.env.local'
load_dotenv(env_path)

# Use the ConEd customer we just created
customer_id = sys.argv[1] if len(sys.argv) > 1 else "10209"

# Configuration
# Check which environment to use based on customer ID or command line arg
import sys

# Allow environment override
use_prod = "--prod" in sys.argv or "-p" in sys.argv

if use_prod:
    api_key = os.getenv('BAYOU_API_KEY_PROD')
    domain = "bayou.energy"
    print(f"# Using PRODUCTION environment ({domain})", file=sys.stderr)
else:
    api_key = os.getenv('BAYOU_API_KEY_STAGING')
    domain = "staging.bayou.energy"
    print(f"# Using STAGING environment ({domain})", file=sys.stderr)

base_url = f"https://{domain}/api/v2"
print(f"# Customer ID: {customer_id}", file=sys.stderr)
print(f"# API Key: {api_key[:20]}..." if api_key else "# No API key found!", file=sys.stderr)

# Get bills
response = requests.get(
    f"{base_url}/customers/{customer_id}/bills",
    auth=(api_key, '')
)

if response.status_code == 200:
    bills = response.json()
    print(json.dumps(bills, indent=2))
else:
    print(json.dumps({
        "error": f"Failed to get bills: {response.status_code}",
        "response": response.text,
        "customer_id": customer_id
    }, indent=2))