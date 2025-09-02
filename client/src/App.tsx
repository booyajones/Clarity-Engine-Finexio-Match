import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout/Layout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import Dashboard from "@/pages/dashboard";
import Upload from "@/pages/upload";
import KeywordManagerPage from "@/pages/keyword-manager";
import SingleClassificationPage from "@/pages/single-classification";
import Classifications from "@/pages/classifications";
import Downloads from "@/pages/downloads";
import NotFound from "@/pages/not-found";
import { BatchJobMonitor } from "@/pages/batch-job-monitor";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/upload" component={Upload} />
        <Route path="/keywords" component={KeywordManagerPage} />
        <Route path="/single" component={SingleClassificationPage} />
        <Route path="/classifications" component={Classifications} />
        <Route path="/downloads" component={Downloads} />
        <Route path="/batch-jobs" component={BatchJobMonitor} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ErrorBoundary>
          <Router />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;