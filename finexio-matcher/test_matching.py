#!/usr/bin/env python3
"""Test matching with variations of known companies."""

import requests
import json

def test_single_match(name):
    """Test a single name match."""
    response = requests.post(
        "http://localhost:8000/v1/match",
        json={"name": name}
    )
    if response.status_code == 200:
        result = response.json()
        return result
    return None

print("=" * 80)
print("FINEXIO MATCHER - COMPREHENSIVE TESTING")
print("=" * 80)

# Test variations of Microsoft
print("\n🔍 Testing Microsoft Variations:")
print("-" * 40)
microsoft_tests = [
    "Microsoft Corporation",
    "Microsoft Corp",
    "Microsoft",
    "MSFT",
    "Microsft",  # Typo
    "Microsoft Inc"
]

for test_name in microsoft_tests:
    result = test_single_match(test_name)
    if result:
        confidence = result.get("confidence", 0)
        decision = result.get("decision", "unknown")
        matched = result.get("matched_payee", {})
        
        symbol = "✅" if decision == "auto_match" else "🟡" if decision == "needs_review" else "❌"
        print(f"{symbol} '{test_name:25}' → {decision:12} ({confidence:.1%})")
        if matched:
            print(f"   Matched to: {matched.get('name', 'Unknown')}")

# Test variations of Home Depot / HD Supply
print("\n🔍 Testing Home Depot / HD Supply Variations:")
print("-" * 40)
hd_tests = [
    "Home Depot",
    "The Home Depot",
    "Home Depot Inc",
    "HD Supply",
    "HD Supply Holdings",
    "HomeDepot"  # No space
]

for test_name in hd_tests:
    result = test_single_match(test_name)
    if result:
        confidence = result.get("confidence", 0)
        decision = result.get("decision", "unknown")
        matched = result.get("matched_payee", {})
        
        symbol = "✅" if decision == "auto_match" else "🟡" if decision == "needs_review" else "❌"
        print(f"{symbol} '{test_name:25}' → {decision:12} ({confidence:.1%})")
        if matched:
            print(f"   Matched to: {matched.get('name', 'Unknown')}")

# Test variations of FedEx
print("\n🔍 Testing FedEx Variations:")
print("-" * 40)
fedex_tests = [
    "FedEx",
    "Federal Express",
    "FedEx Corporation",
    "Fed Ex",  # Space
    "FEDEX",
    "FedX"  # Typo
]

for test_name in fedex_tests:
    result = test_single_match(test_name)
    if result:
        confidence = result.get("confidence", 0)
        decision = result.get("decision", "unknown")
        matched = result.get("matched_payee", {})
        
        symbol = "✅" if decision == "auto_match" else "🟡" if decision == "needs_review" else "❌"
        print(f"{symbol} '{test_name:25}' → {decision:12} ({confidence:.1%})")
        if matched:
            print(f"   Matched to: {matched.get('name', 'Unknown')}")

# Batch test
print("\n📊 Testing Batch Match with 20 Company Variations:")
print("-" * 40)

batch_names = [
    "Microsoft", "Apple Computer", "Amazon Web Services", "Google",
    "Fed Ex", "UPS", "The Home Depot", "HD Supply",
    "Walmart Stores", "Tesla Motors", "Facebook", "Netflix",
    "Oracle", "IBM", "Intel Corp", "MSFT", "AAPL", "AMZN", "GOOGL", "WMT"
]

response = requests.post(
    "http://localhost:8000/v1/match/batch",
    json={"names": batch_names, "stream": False}
)

if response.status_code == 200:
    results = response.json()
    
    auto_matches = [r for r in results if r.get("decision") == "auto_match"]
    reviews = [r for r in results if r.get("decision") == "needs_review"]
    no_matches = [r for r in results if r.get("decision") == "no_match"]
    
    print(f"\nResults Summary:")
    print(f"  ✅ Auto-matches: {len(auto_matches)}/{len(results)}")
    print(f"  🟡 Need review: {len(reviews)}/{len(results)}")
    print(f"  ❌ No matches: {len(no_matches)}/{len(results)}")
    
    if auto_matches:
        print(f"\nHigh Confidence Matches:")
        for r in auto_matches[:10]:  # Show first 10
            query = r.get("query", "")
            matched = r.get("matched_payee", {})
            conf = r.get("confidence", 0)
            print(f"  {query:25} → {matched.get('name', 'N/A'):30} ({conf:.1%})")

print("\n" + "=" * 80)
print("TEST COMPLETE")
print("=" * 80)
