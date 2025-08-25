import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
// STRIPPED: Removed 90% of background services for single-customer use
import { mastercardApi } from "./services/mastercardApi";
import { getMastercardWorker } from "./services/mastercardWorker";

const app = express();
// Security and optimization middleware
app.use(express.json({ limit: '10mb' })); // Optimized for deployment stability
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Trust proxy for better security behind reverse proxies
app.set('trust proxy', 1);

// CRITICAL FIX: Remove response body logging to save memory
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
      // Log only metadata, not the body
      const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms [${responseSize} bytes]`;
      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log('🚀 Starting application initialization...');
    
    // Initialize Mastercard service during startup
    console.log('🔧 Mastercard service initialized:', mastercardApi.isServiceConfigured() ? '✅ Ready' : '❌ Not configured');
    
    // Start Mastercard worker if service is configured
    if (mastercardApi.isServiceConfigured()) {
      const mastercardWorker = getMastercardWorker();
      mastercardWorker.start();
      console.log('📡 Mastercard worker started for polling search results');
    }
    
    const server = await registerRoutes(app);
    
    // Add startup timeout handling
    const STARTUP_TIMEOUT = 30000; // 30 seconds
    const startupTimeout = setTimeout(() => {
      console.error('❌ Server startup timeout exceeded');
      process.exit(1);
    }, STARTUP_TIMEOUT);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      
      console.error('Error handler caught:', {
        status,
        message,
        stack: err.stack
      });

      res.status(status).json({ message });
      // Don't throw the error here as it will crash the server
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on port 5000
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000');
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      clearTimeout(startupTimeout); // Clear startup timeout on success
      log(`✅ Server serving on port ${port}`);
      console.log(`🌐 Server ready at http://0.0.0.0:${port}`);
      
      // MINIMAL: Only log that server is ready
      // No background workers, no monitors, no schedulers
      // Everything runs on-demand when actually needed
      console.log('✅ Server ready - minimal memory mode');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})().catch((error) => {
  console.error('Unhandled error in server startup:', error);
  process.exit(1);
});

// Graceful shutdown handling for deployment
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  // Stop Mastercard worker if running
  if (mastercardApi.isServiceConfigured()) {
    const mastercardWorker = getMastercardWorker();
    mastercardWorker.stop();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  // Stop Mastercard worker if running
  if (mastercardApi.isServiceConfigured()) {
    const mastercardWorker = getMastercardWorker();
    mastercardWorker.stop();
  }
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
