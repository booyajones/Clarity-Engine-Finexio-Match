#!/bin/bash

# Start script with memory optimization settings
# Based on Phase 3, Item 7 of optimization plan

# Set NODE_OPTIONS for memory optimization
export NODE_OPTIONS="--max-old-space-size=512"

# Start the server
echo "🚀 Starting server with optimized memory settings..."
echo "   Max heap: 512MB"
echo "   Mode: Single-customer optimized"

# Run the development server
npm run dev