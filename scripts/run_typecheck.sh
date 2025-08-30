#!/bin/bash
set -e

echo "📝 Running TypeScript type checking..."
npx tsc --noEmit --skipLibCheck || {
    echo "❌ Type errors found"
    exit 1
}
echo "✅ Type check passed"