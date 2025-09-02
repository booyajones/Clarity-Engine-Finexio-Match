import express from "express";
import path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
import { spawn } from "child_process";

export function setupFrontend(app: express.Express) {
  // In development, proxy to Vite dev server
  if (process.env.NODE_ENV === "development") {
    // Start Vite dev server
    console.log("Starting Vite dev server...");
    spawn("npx", ["vite", "--port", "5173", "--host", "0.0.0.0"], {
      cwd: process.cwd(),
      stdio: "inherit"
    });
    
    // Create proxy middleware immediately but with retry logic
    const viteProxy = createProxyMiddleware({
      target: "http://localhost:5173",
      changeOrigin: true,
      ws: true,
      onError: (err: any, req: any, res: any) => {
        // If Vite isn't ready yet, return a waiting page
        if (err.code === 'ECONNREFUSED') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <title>Loading...</title>
              <meta http-equiv="refresh" content="1">
            </head>
            <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
              <div style="text-align: center;">
                <h2>Starting Clarity Engine...</h2>
                <p>The application is loading. This page will refresh automatically.</p>
              </div>
            </body>
            </html>
          `);
        } else {
          console.error('Proxy error:', err);
        }
      }
    });
    
    // Set up proxy immediately
    app.use((req, res, next) => {
      if (!req.path.startsWith("/api")) {
        viteProxy(req, res, next);
      } else {
        next();
      }
    });
  } else {
    // In production, serve built files
    const distPath = path.join(process.cwd(), "server", "public");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (!req.path.startsWith("/api")) {
        res.sendFile(path.join(distPath, "index.html"));
      }
    });
  }
}