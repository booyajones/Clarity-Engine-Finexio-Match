#!/bin/bash
set -e

echo "🧪 Running unit tests..."
npx vitest run --dir server --dir client/src --coverage || {
    echo "❌ Unit tests failed"
    exit 1
}
echo "✅ Unit tests passed"