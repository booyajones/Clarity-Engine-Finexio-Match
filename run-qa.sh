#!/bin/bash
# Comprehensive QA Runner Script

echo "🚀 Starting Comprehensive QA Testing"
echo "====================================="

# Run the full QA suite
make qa

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ ALL QA GATES PASSED!"
    echo "====================================="
    echo "View detailed reports at:"
    echo "  - qa_reports/summary.md"
    echo "  - qa_reports/metrics.json"
    echo "  - qa_reports/htmlcov/"
else
    echo ""
    echo "❌ QA FAILED - Please fix issues and rerun"
    exit 1
fi