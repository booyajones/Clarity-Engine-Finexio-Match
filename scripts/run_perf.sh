#!/bin/bash
set -e

echo "⚡ Running performance tests..."

# Run basic performance benchmarks
PERF_LOG="qa_reports/perf_results.json"
mkdir -p qa_reports

# Test API response times
echo '{"api_latency": {' > $PERF_LOG
curl -w '  "dashboard_stats": %{time_total},' http://localhost:5000/api/dashboard/stats -o /dev/null -s
curl -w '  "upload_batches": %{time_total}' http://localhost:5000/api/upload/batches?limit=1 -o /dev/null -s
echo '}}' >> $PERF_LOG

# Check if response times are under threshold (2 seconds)
if grep -E '[2-9]\.[0-9]+|[1-9][0-9]+\.' $PERF_LOG; then
    echo "❌ Performance regression detected (>2s response time)"
    exit 1
fi

echo "✅ Performance tests passed"