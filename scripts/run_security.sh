#!/bin/bash
set -e

echo "🔒 Running security checks..."

# Check for vulnerabilities in npm packages
npm audit --audit-level=high || {
    echo "❌ Security vulnerabilities found in dependencies"
    exit 1
}

# Check for secrets in code
if command -v git-secrets &> /dev/null; then
    git secrets --scan || {
        echo "❌ Secrets detected in code"
        exit 1
    }
fi

echo "✅ Security checks passed"