import { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, info);
    // Attempt to report the error to a remote service for diagnostics
    try {
      if (typeof fetch !== "undefined") {
        fetch("/api/log-client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: error.message, info }),
          keepalive: true,
        });
      }
    } catch (reportError) {
      console.error("Failed to report error", reportError);
    }
  }

  private handleRestart = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center space-y-4">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p>Please try reloading the page or report the issue.</p>
          <div className="flex space-x-4">
            <button
              onClick={this.handleRestart}
              className="px-4 py-2 bg-primary-500 text-white rounded"
            >
              Reload
            </button>
            <a
              href="mailto:support@example.com"
              className="px-4 py-2 border rounded"
            >
              Send Feedback
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

