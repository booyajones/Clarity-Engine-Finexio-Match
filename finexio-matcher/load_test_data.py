#!/usr/bin/env python3
"""Load test suppliers into the Finexio matcher."""

import requests
import json

# Known suppliers we want to test
test_suppliers = [
    {"name": "Microsoft Corporation", "city": "Redmond", "state": "WA"},
    {"name": "Home Depot Inc", "city": "Atlanta", "state": "GA"},
    {"name": "HD Supply Holdings Inc", "city": "Atlanta", "state": "GA"},
    {"name": "FedEx Corporation", "city": "Memphis", "state": "TN"},
    {"name": "Apple Inc", "city": "Cupertino", "state": "CA"},
    {"name": "Amazon.com Inc", "city": "Seattle", "state": "WA"},
    {"name": "Google LLC", "city": "Mountain View", "state": "CA"},
    {"name": "Walmart Inc", "city": "Bentonville", "state": "AR"},
    {"name": "United Parcel Service", "city": "Atlanta", "state": "GA"},
    {"name": "Tesla Inc", "city": "Austin", "state": "TX"},
    {"name": "Facebook Inc", "city": "Menlo Park", "state": "CA"},
    {"name": "Netflix Inc", "city": "Los Gatos", "state": "CA"},
    {"name": "Oracle Corporation", "city": "Austin", "state": "TX"},
    {"name": "IBM Corporation", "city": "Armonk", "state": "NY"},
    {"name": "Intel Corporation", "city": "Santa Clara", "state": "CA"}
]

print("Loading test suppliers into Finexio matcher...")
print("=" * 60)

response = requests.post(
    "http://localhost:8000/v1/payees/ingest",
    json={"payees": test_suppliers}
)

if response.status_code == 200:
    result = response.json()
    print(f"✅ Success!")
    print(f"   Inserted: {result['inserted']}")
    print(f"   Updated: {result['updated']}")
    if result.get('errors'):
        print(f"   Errors: {len(result['errors'])}")
else:
    print(f"❌ Failed: {response.status_code}")
    print(response.text)

print("=" * 60)
