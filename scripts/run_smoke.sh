#!/bin/bash
set -e

echo "🔥 Running smoke tests..."
# Check if server is responding
curl -f http://localhost:5000/api/health > /dev/null 2>&1 || {
    echo "❌ Server health check failed"
    exit 1
}

# Check critical endpoints
curl -f http://localhost:5000/api/dashboard/stats > /dev/null 2>&1 || {
    echo "❌ Dashboard stats endpoint failed"
    exit 1
}

echo "✅ Smoke tests passed"