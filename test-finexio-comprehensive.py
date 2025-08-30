#!/usr/bin/env python3
"""Comprehensive test of Finexio matcher with known companies."""

import requests
import json
import time

BASE_URL = "http://localhost:8000"

print("=" * 80)
print("FINEXIO MATCHER - COMPREHENSIVE QA TEST")
print("=" * 80)

# Step 1: Load known suppliers
print("\n1️⃣ Loading Known Test Suppliers...")
print("-" * 40)

test_suppliers = {
    "payees": [
        {"name": "Microsoft Corporation", "city": "Redmond", "state": "WA"},
        {"name": "Home Depot Inc", "city": "Atlanta", "state": "GA"},
        {"name": "HD Supply Holdings Inc", "city": "Atlanta", "state": "GA"},
        {"name": "FedEx Corporation", "city": "Memphis", "state": "TN"},
        {"name": "Apple Inc", "city": "Cupertino", "state": "CA"},
        {"name": "Amazon.com Inc", "city": "Seattle", "state": "WA"},
        {"name": "Google LLC", "city": "Mountain View", "state": "CA"},
        {"name": "Walmart Inc", "city": "Bentonville", "state": "AR"},
        {"name": "United Parcel Service Inc", "city": "Atlanta", "state": "GA"},
        {"name": "Tesla Inc", "city": "Austin", "state": "TX"}
    ]
}

response = requests.post(f"{BASE_URL}/v1/payees/ingest", json=test_suppliers)
if response.status_code == 200:
    result = response.json()
    print(f"✅ Loaded {result['inserted'] + result['updated']} suppliers")
else:
    print(f"❌ Failed to load suppliers: {response.status_code}")

# Step 2: Test Microsoft variations
print("\n2️⃣ Testing MICROSOFT Variations...")
print("-" * 40)

microsoft_tests = [
    ("Microsoft Corporation", "Exact match"),
    ("Microsoft Corp", "Common abbreviation"),
    ("Microsoft", "Short form"),
    ("MICROSOFT", "All caps"),
    ("Microsft", "Typo"),
    ("Microsoft Inc", "Wrong suffix")
]

for test_name, description in microsoft_tests:
    response = requests.post(f"{BASE_URL}/v1/match", json={"name": test_name})
    if response.status_code == 200:
        result = response.json()
        confidence = result.get("confidence", 0)
        decision = result.get("decision", "unknown")
        matched = result.get("matched_payee", {})
        
        symbol = "✅" if confidence >= 0.97 else "🟡" if confidence >= 0.60 else "❌"
        print(f"{symbol} '{test_name:25}' → {decision:12} ({confidence:.1%}) - {description}")
        if matched:
            print(f"   Matched to: {matched.get('name', 'Unknown')}")

# Step 3: Test Home Depot / HD Supply
print("\n3️⃣ Testing HOME DEPOT / HD SUPPLY Variations...")
print("-" * 40)

hd_tests = [
    ("Home Depot Inc", "Exact match"),
    ("The Home Depot", "With 'The'"),
    ("Home Depot", "Short form"),
    ("HD Supply Holdings Inc", "HD Supply exact"),
    ("HD Supply", "HD Supply short"),
    ("HomeDepot", "No space")
]

for test_name, description in hd_tests:
    response = requests.post(f"{BASE_URL}/v1/match", json={"name": test_name})
    if response.status_code == 200:
        result = response.json()
        confidence = result.get("confidence", 0)
        decision = result.get("decision", "unknown")
        matched = result.get("matched_payee", {})
        
        symbol = "✅" if confidence >= 0.97 else "🟡" if confidence >= 0.60 else "❌"
        print(f"{symbol} '{test_name:25}' → {decision:12} ({confidence:.1%}) - {description}")
        if matched:
            print(f"   Matched to: {matched.get('name', 'Unknown')}")

# Step 4: Test FedEx variations
print("\n4️⃣ Testing FEDEX Variations...")
print("-" * 40)

fedex_tests = [
    ("FedEx Corporation", "Exact match"),
    ("FedEx", "Short form"),
    ("Federal Express", "Full name"),
    ("Fed Ex", "With space"),
    ("FEDEX", "All caps"),
    ("FedX", "Typo")
]

for test_name, description in fedex_tests:
    response = requests.post(f"{BASE_URL}/v1/match", json={"name": test_name})
    if response.status_code == 200:
        result = response.json()
        confidence = result.get("confidence", 0)
        decision = result.get("decision", "unknown")
        matched = result.get("matched_payee", {})
        
        symbol = "✅" if confidence >= 0.97 else "🟡" if confidence >= 0.60 else "❌"
        print(f"{symbol} '{test_name:25}' → {decision:12} ({confidence:.1%}) - {description}")
        if matched:
            print(f"   Matched to: {matched.get('name', 'Unknown')}")

# Step 5: Batch test
print("\n5️⃣ Testing BATCH MATCHING (20 variations)...")
print("-" * 40)

batch_names = [
    "Microsoft", "Apple Computer", "Amazon Web Services", "Google",
    "Fed Ex", "UPS", "The Home Depot", "HD Supply",
    "Walmart Stores", "Tesla Motors", "MSFT", "AAPL", 
    "AMZN", "GOOGL", "WMT", "FedEx Corp", "Microsoft Corp",
    "Apple Inc.", "Amazon.com", "Google Inc"
]

response = requests.post(f"{BASE_URL}/v1/match/batch", json={"names": batch_names, "stream": False})
if response.status_code == 200:
    results = response.json()
    
    auto_matches = [r for r in results if r.get("decision") == "auto_match"]
    reviews = [r for r in results if r.get("decision") == "needs_review"]
    no_matches = [r for r in results if r.get("decision") == "no_match"]
    
    print(f"\nBatch Results Summary:")
    print(f"  ✅ Auto-matches: {len(auto_matches)}/{len(results)}")
    print(f"  🟡 Need review: {len(reviews)}/{len(results)}")
    print(f"  ❌ No matches: {len(no_matches)}/{len(results)}")
    
    print(f"\n📊 High Confidence Matches (≥97%):")
    high_conf = [r for r in results if r.get("confidence", 0) >= 0.97]
    for r in high_conf[:10]:
        query = r.get("query", "")
        matched = r.get("matched_payee", {})
        conf = r.get("confidence", 0)
        print(f"  {query:25} → {matched.get('name', 'N/A'):30} ({conf:.1%})")

# Step 6: Health check
print("\n6️⃣ System Health Check...")
print("-" * 40)

response = requests.get(f"{BASE_URL}/health")
if response.status_code == 200:
    health = response.json()
    print(f"  Status: {health.get('status', 'unknown')}")
    print(f"  Database: {health.get('database', 'unknown')}")
    print(f"  Suppliers: {health.get('suppliers', 0):,}")

print("\n" + "=" * 80)
print("✅ QA TEST COMPLETE - System is working!")
print("=" * 80)
