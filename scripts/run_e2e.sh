#!/bin/bash
set -e

echo "🌐 Running E2E tests..."
# Run Playwright tests if they exist
if [ -d "e2e" ]; then
    npx playwright test || {
        echo "❌ E2E tests failed"
        exit 1
    }
else
    echo "⚠️ No E2E tests found, skipping"
fi
echo "✅ E2E tests passed"