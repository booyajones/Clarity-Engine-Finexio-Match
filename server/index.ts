import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { log } from "./vite";
import { setupFrontend } from "./frontend-server";
import memoryMonitor from "./utils/memoryMonitor";

const app = express();
// Security and optimization middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Trust proxy for better security behind reverse proxies
app.set('trust proxy', 1);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let responseSize = 0;

  // Track response size without capturing body
  const originalSend = res.send;
  res.send = function(data: any) {
    if (data) {
      responseSize = Buffer.byteLength(data);
    }
    return originalSend.call(res, data);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms [${responseSize} bytes]`;
      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log('🚀 Starting Finexio Match application...');
    
    // Start memory monitoring
    memoryMonitor.start();
    console.log('📊 Memory monitoring started');
    
    // Manual garbage collection for memory optimization
    if (global.gc) {
      setInterval(() => {
        try {
          const beforeGC = process.memoryUsage();
          global.gc?.();
          const afterGC = process.memoryUsage();
          const freed = beforeGC.heapUsed - afterGC.heapUsed;
          if (freed > 5 * 1024 * 1024) { // Only log if we freed > 5MB
            console.log(`🧹 GC freed ${Math.round(freed / 1024 / 1024)}MB (heap: ${Math.round(afterGC.heapUsed / 1024 / 1024)}MB)`);
          }
        } catch (error: any) {
          console.log('⚠️ GC error:', error.message);
        }
      }, 10000); // Every 10 seconds
      console.log('🧠 Garbage collection enabled (10s interval)');
    } else {
      console.log('⚠️ Garbage collection not available - restart with --expose-gc for better memory management');
    }
    
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      
      console.error('Error handler caught:', {
        status,
        message,
        stack: err.stack
      });

      res.status(status).json({ message });
    });

    // Register routes and start server
    const server = await registerRoutes(app);
    
    // Setup frontend serving
    setupFrontend(app);

    console.log('✅ Finexio Match server ready');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})().catch((error) => {
  console.error('Unhandled error in server startup:', error);
  process.exit(1);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});