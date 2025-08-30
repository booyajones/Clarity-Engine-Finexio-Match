#!/bin/bash

echo "=================================================="
echo "FINEXIO MATCHER - STARTUP AND TEST"
echo "=================================================="

# Set environment variables
export DATABASE_URL=$DATABASE_URL
export BIGQUERY_PROJECT_ID=$BIGQUERY_PROJECT_ID
export BIGQUERY_CREDENTIALS=$BIGQUERY_CREDENTIALS
export OPENAI_API_KEY=$OPENAI_API_KEY

# Change to finexio-matcher directory
cd finexio-matcher

echo ""
echo "1️⃣ Starting Finexio Matcher Service..."
echo "------------------------------------------"

# Start the service in background
python main.py &
SERVICE_PID=$!

# Wait for service to be ready
echo "Waiting for service to start..."
sleep 5

# Check if service is running
if kill -0 $SERVICE_PID 2>/dev/null; then
    echo "✅ Service started (PID: $SERVICE_PID)"
else
    echo "❌ Service failed to start"
    exit 1
fi

echo ""
echo "2️⃣ Checking Service Health..."
echo "------------------------------------------"
curl -s http://localhost:8000/health | python -m json.tool

echo ""
echo "3️⃣ Loading Test Suppliers..."
echo "------------------------------------------"

# Create test suppliers that we know exist
cat > test_suppliers.json << 'EOF'
{
  "payees": [
    {"name": "Microsoft Corporation", "city": "Redmond", "state": "WA"},
    {"name": "Home Depot", "city": "Atlanta", "state": "GA"},
    {"name": "HD Supply", "city": "Atlanta", "state": "GA"},
    {"name": "FedEx Corporation", "city": "Memphis", "state": "TN"},
    {"name": "Apple Inc", "city": "Cupertino", "state": "CA"},
    {"name": "Amazon.com Inc", "city": "Seattle", "state": "WA"},
    {"name": "Google LLC", "city": "Mountain View", "state": "CA"},
    {"name": "Walmart Inc", "city": "Bentonville", "state": "AR"},
    {"name": "UPS", "city": "Atlanta", "state": "GA"},
    {"name": "Tesla Inc", "city": "Austin", "state": "TX"}
  ]
}
EOF

echo "Loading known suppliers into database..."
curl -X POST http://localhost:8000/v1/payees/ingest \
  -H "Content-Type: application/json" \
  -d @test_suppliers.json \
  -s | python -m json.tool

echo ""
echo "4️⃣ Testing Single Match: Microsoft"
echo "------------------------------------------"
curl -X POST http://localhost:8000/v1/match \
  -H "Content-Type: application/json" \
  -d '{"name": "Microsoft Corp"}' \
  -s | python -m json.tool

echo ""
echo "5️⃣ Testing Single Match: Home Depot"
echo "------------------------------------------"
curl -X POST http://localhost:8000/v1/match \
  -H "Content-Type: application/json" \
  -d '{"name": "The Home Depot"}' \
  -s | python -m json.tool

echo ""
echo "6️⃣ Testing Batch Match"
echo "------------------------------------------"
curl -X POST http://localhost:8000/v1/match/batch \
  -H "Content-Type: application/json" \
  -d '{
    "names": [
      "Microsoft",
      "HD Supply",
      "FedEx",
      "Apple Computer",
      "Amazon Web Services"
    ],
    "stream": false
  }' \
  -s | python -m json.tool

echo ""
echo "=================================================="
echo "TEST COMPLETE"
echo "=================================================="

# Cleanup
echo "Stopping service..."
kill $SERVICE_PID 2>/dev/null
wait $SERVICE_PID 2>/dev/null

echo "✅ All tests completed"