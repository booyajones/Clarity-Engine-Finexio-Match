#!/usr/bin/env python3
"""Test the Finexio matcher with known companies."""

import os
import sys
import json
import time
import requests
from typing import List, Dict
import subprocess

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def wait_for_service(url: str, timeout: int = 30):
    """Wait for service to be ready."""
    print(f"Waiting for service at {url}...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            response = requests.get(url)
            if response.status_code == 200:
                print("✓ Service is ready!")
                return True
        except:
            pass
        time.sleep(1)
    return False

def test_known_companies():
    """Test matching with known companies."""
    base_url = "http://localhost:8000"
    
    # Known test companies with variations
    test_companies = [
        # Microsoft variations
        "Microsoft Corporation",
        "Microsoft Corp",
        "Microsoft",
        "MSFT",
        "Microsoft Inc",
        
        # Home Depot variations
        "Home Depot",
        "The Home Depot",
        "Home Depot Inc",
        "HD Supply",
        "Home Depot USA",
        
        # FedEx variations
        "FedEx",
        "Federal Express",
        "FedEx Corporation",
        "Fed Ex",
        "FEDEX CORP",
        
        # Apple variations
        "Apple Inc",
        "Apple Computer",
        "Apple",
        "AAPL",
        "Apple Inc.",
        
        # Amazon variations
        "Amazon",
        "Amazon.com",
        "Amazon Inc",
        "Amazon Web Services",
        "AWS",
        
        # Google variations
        "Google",
        "Google LLC",
        "Google Inc",
        "Alphabet Inc",
        "GOOGL"
    ]
    
    print("\n" + "="*80)
    print("TESTING FINEXIO MATCHER WITH KNOWN COMPANIES")
    print("="*80)
    
    # Test single match endpoint
    print("\n📋 Testing Single Match Endpoint:")
    print("-" * 40)
    
    for company in test_companies[:10]:  # Test first 10
        try:
            response = requests.post(
                f"{base_url}/v1/match",
                json={"name": company},
                timeout=5
            )
            
            if response.status_code == 200:
                result = response.json()
                confidence = result.get("confidence", 0)
                decision = result.get("decision", "unknown")
                matched = result.get("matched_payee", {})
                
                # Color code based on confidence
                if confidence >= 0.97:
                    status = "✅"
                elif confidence >= 0.60:
                    status = "🟡"
                else:
                    status = "❌"
                
                print(f"{status} {company:30} → {decision:12} ({confidence:.1%})")
                
                if matched:
                    print(f"   Matched to: {matched.get('name', 'Unknown')}")
                    
            else:
                print(f"❌ {company:30} → Error: {response.status_code}")
                
        except Exception as e:
            print(f"❌ {company:30} → Error: {str(e)}")
    
    # Test batch match endpoint
    print("\n📋 Testing Batch Match Endpoint:")
    print("-" * 40)
    
    try:
        response = requests.post(
            f"{base_url}/v1/match/batch",
            json={
                "names": test_companies,
                "stream": False
            },
            timeout=30
        )
        
        if response.status_code == 200:
            results = response.json()
            
            # Summarize results
            auto_matches = sum(1 for r in results if r.get("decision") == "auto_match")
            reviews = sum(1 for r in results if r.get("decision") == "needs_review")
            no_matches = sum(1 for r in results if r.get("decision") == "no_match")
            
            print(f"\n📊 Batch Results Summary:")
            print(f"   Total tested: {len(results)}")
            print(f"   ✅ Auto-matches: {auto_matches}")
            print(f"   🟡 Need review: {reviews}")
            print(f"   ❌ No matches: {no_matches}")
            
            # Show high-confidence matches
            print(f"\n🎯 High Confidence Matches (≥97%):")
            for result in results:
                if result.get("confidence", 0) >= 0.97:
                    query = result.get("query", "Unknown")
                    matched = result.get("matched_payee", {})
                    confidence = result.get("confidence", 0)
                    print(f"   {query:30} → {matched.get('name', 'N/A'):30} ({confidence:.1%})")
                    
        else:
            print(f"❌ Batch match failed: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Batch match error: {str(e)}")
    
    # Test health endpoint
    print("\n📋 Testing Health Check:")
    print("-" * 40)
    
    try:
        response = requests.get(f"{base_url}/health")
        if response.status_code == 200:
            health = response.json()
            print(f"   Status: {health.get('status', 'unknown')}")
            print(f"   Database: {health.get('database', 'unknown')}")
            print(f"   Suppliers loaded: {health.get('suppliers', 0):,}")
        else:
            print(f"❌ Health check failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Health check error: {str(e)}")
    
    print("\n" + "="*80)
    print("TEST COMPLETE")
    print("="*80)

if __name__ == "__main__":
    # Check if service is running
    if not wait_for_service("http://localhost:8000/health", timeout=5):
        print("⚠️  Service not running. Starting Finexio matcher...")
        # Start the service
        process = subprocess.Popen(
            ["python", "main.py"],
            cwd=os.path.dirname(os.path.abspath(__file__))
        )
        
        # Wait for it to start
        if wait_for_service("http://localhost:8000/health", timeout=30):
            test_known_companies()
        else:
            print("❌ Failed to start service")
            process.terminate()
    else:
        # Service already running
        test_known_companies()