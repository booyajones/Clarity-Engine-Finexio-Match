#!/bin/bash

# Kill any existing tsx processes
pkill -f tsx 2>/dev/null || true
sleep 1

# Start with optimized memory settings
echo "🚀 Starting optimized server with garbage collection enabled..."
export NODE_ENV=development
export NODE_OPTIONS="--expose-gc --max-old-space-size=100"

# Start single instance with garbage collection
exec node --expose-gc --max-old-space-size=100 node_modules/.bin/tsx server/index.ts