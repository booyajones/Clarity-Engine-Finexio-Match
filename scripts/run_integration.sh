#!/bin/bash
set -e

echo "🔗 Running integration tests..."
# Test file upload and processing pipeline
npx vitest run --dir server --grep "integration" || {
    echo "❌ Integration tests failed"
    exit 1
}
echo "✅ Integration tests passed"