import { Component, type ErrorInfo, type ReactNode } from "react";
import "./ErrorBoundary.css";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * The last line of defense against a genuinely unexpected render
 * exception - not the "this phase's data hasn't arrived yet" case,
 * which gets its own explicit "Catching up…" fallback directly in
 * Host/Player/Stage (see e.g. HostControlPanelPage's "reveal && !question"
 * branch) so it never needs to reach here at all. This exists for the
 * genuinely-unanticipated case: a real thrown exception during render,
 * which without a boundary unmounts the whole React tree and leaves a
 * blank page with no way back. Logs enough to diagnose what state
 * triggered it (message, stack, current path) without ever logging
 * answer content or full room data.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", {
      message: error.message,
      path: window.location.pathname,
      componentStack: info.componentStack,
    });
  }

  handleRetry = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1>Something went wrong while loading this game.</h1>
          <p>This is usually temporary — reconnecting almost always fixes it.</p>
          <div className="error-boundary-actions">
            <button type="button" className="btn btn-primary" onClick={this.handleRetry}>
              Retry
            </button>
            <a href="/" className="btn btn-ghost">
              Return to Home
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
