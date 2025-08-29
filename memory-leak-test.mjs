#!/usr/bin/env node

/**
 * MEMORY LEAK DETECTION AND ANALYSIS
 * Runs continuous memory monitoring to detect leaks and performance issues
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000';
const MONITORING_DURATION = 60000; // 1 minute
const SAMPLE_INTERVAL = 2000; // Every 2 seconds

async function monitorMemoryLeaks() {
  console.log('🧠 MEMORY LEAK DETECTION STARTING...');
  console.log('Duration: 60 seconds | Sample interval: 2 seconds');
  
  const samples = [];
  const startTime = Date.now();
  
  while (Date.now() - startTime < MONITORING_DURATION) {
    try {
      const response = await fetch(`${API_BASE}/api/monitoring/memory`);
      const data = await response.json();
      
      samples.push({
        timestamp: Date.now(),
        heapUsed: data.current.heapUsed,
        heapTotal: data.current.heapTotal,
        heapUsedPercent: data.current.heapUsedPercent,
        rss: data.current.rss
      });
      
      console.log(`⏱️  ${new Date().toLocaleTimeString()}: ${data.current.heapUsed}MB (${data.current.heapUsedPercent}%)`);
      
      await new Promise(resolve => setTimeout(resolve, SAMPLE_INTERVAL));
    } catch (error) {
      console.error('Memory monitoring error:', error.message);
    }
  }
  
  // Analysis
  console.log('\n📊 MEMORY ANALYSIS RESULTS:');
  
  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  const maxHeap = Math.max(...samples.map(s => s.heapUsed));
  const minHeap = Math.min(...samples.map(s => s.heapUsed));
  const avgHeap = samples.reduce((sum, s) => sum + s.heapUsed, 0) / samples.length;
  
  const totalGrowth = lastSample.heapUsed - firstSample.heapUsed;
  const maxGrowth = maxHeap - firstSample.heapUsed;
  
  console.log(`   Initial Heap: ${firstSample.heapUsed}MB`);
  console.log(`   Final Heap: ${lastSample.heapUsed}MB`);
  console.log(`   Net Growth: ${totalGrowth.toFixed(1)}MB`);
  console.log(`   Peak Heap: ${maxHeap}MB`);
  console.log(`   Min Heap: ${minHeap}MB`);
  console.log(`   Avg Heap: ${avgHeap.toFixed(1)}MB`);
  
  // Leak detection logic
  const LEAK_THRESHOLD = 20; // MB
  const HIGH_USAGE_THRESHOLD = 90; // Percent
  
  if (totalGrowth > LEAK_THRESHOLD) {
    console.log(`🚨 POTENTIAL MEMORY LEAK DETECTED: ${totalGrowth.toFixed(1)}MB growth`);
  } else if (totalGrowth > 10) {
    console.log(`⚠️  MODERATE MEMORY GROWTH: ${totalGrowth.toFixed(1)}MB`);
  } else {
    console.log(`✅ MEMORY STABLE: Only ${totalGrowth.toFixed(1)}MB growth`);
  }
  
  const highUsageSamples = samples.filter(s => s.heapUsedPercent > HIGH_USAGE_THRESHOLD);
  if (highUsageSamples.length > samples.length * 0.5) {
    console.log(`🚨 HIGH MEMORY PRESSURE: ${((highUsageSamples.length / samples.length) * 100).toFixed(1)}% of time above ${HIGH_USAGE_THRESHOLD}%`);
  }
  
  // Growth trend analysis
  const midpoint = Math.floor(samples.length / 2);
  const firstHalfAvg = samples.slice(0, midpoint).reduce((sum, s) => sum + s.heapUsed, 0) / midpoint;
  const secondHalfAvg = samples.slice(midpoint).reduce((sum, s) => sum + s.heapUsed, 0) / (samples.length - midpoint);
  const trendGrowth = secondHalfAvg - firstHalfAvg;
  
  if (trendGrowth > 5) {
    console.log(`📈 UPWARD TREND: Memory increasing by ${trendGrowth.toFixed(1)}MB over time`);
  } else if (trendGrowth < -5) {
    console.log(`📉 DOWNWARD TREND: Memory decreasing by ${Math.abs(trendGrowth).toFixed(1)}MB over time`);
  } else {
    console.log(`➡️  STABLE TREND: Minimal change (${trendGrowth.toFixed(1)}MB)`);
  }
  
  return {
    samples,
    analysis: {
      totalGrowth,
      maxGrowth,
      avgHeap,
      potentialLeak: totalGrowth > LEAK_THRESHOLD,
      highPressure: highUsageSamples.length > samples.length * 0.5,
      trend: trendGrowth
    }
  };
}

monitorMemoryLeaks();