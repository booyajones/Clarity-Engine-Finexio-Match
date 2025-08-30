#!/bin/bash
set -e

echo "🔍 Running ESLint..."
npx eslint server/**/*.ts client/src/**/*.tsx client/src/**/*.ts --fix --quiet || {
    echo "❌ Lint errors found"
    exit 1
}
echo "✅ Lint check passed"