import express from "express";
import path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
import { spawn } from "child_process";

export function setupFrontend(app: express.Express) {
  // In development, proxy to Vite dev server
  if (process.env.NODE_ENV === "development") {
    // Start Vite dev server
    console.log("Starting Vite dev server...");
    const viteProcess = spawn("npx", ["vite", "--port", "5173", "--host", "0.0.0.0"], {
      cwd: process.cwd(),
      stdio: "inherit"
    });
    
    // Give Vite time to start
    setTimeout(() => {
      // Proxy all non-API requests to Vite
      app.use((req, res, next) => {
        if (!req.path.startsWith("/api")) {
          createProxyMiddleware({
            target: "http://localhost:5173",
            changeOrigin: true,
            ws: true,
            logLevel: "error"
          })(req, res, next);
        } else {
          next();
        }
      });
    }, 3000);
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