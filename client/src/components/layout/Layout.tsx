import { useLocation } from "wouter";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import React from "react";

const headers: Record<string, { title: string; subtitle?: string }> = {
  "/": {
    title: "Dashboard",
    subtitle: "Overview of classification activity",
  },
  "/upload": {
    title: "Upload Data",
    subtitle:
      "Upload CSV or Excel files for high-accuracy OpenAI classification (95%+ confidence only)",
  },
  "/keywords": {
    title: "Keyword Manager",
    subtitle: "Manage exclusion keywords",
  },
  "/single": {
    title: "Single Classification",
    subtitle: "Classify a single payee",
  },
  "/classifications": {
    title: "Classifications",
    subtitle: "View and manage all payee classifications",
  },
  "/downloads": {
    title: "Downloads",
    subtitle: "Download completed classification results",
  },
  "/batch-jobs": {
    title: "Batch Jobs",
    subtitle: "Monitor processing jobs",
  },
};

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const header = headers[location] || { title: "" };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 transition-colors duration-300">
      {/* Sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <Header title={header.title} subtitle={header.subtitle} />
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

