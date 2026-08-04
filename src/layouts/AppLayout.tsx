import { Outlet, Link } from "react-router-dom";
import { Settings } from "lucide-react";
import ConfigWarning from "../components/ConfigWarning";
import ErrorBoundary from "../components/ErrorBoundary";
import "./AppLayout.css";

function AppLayout() {
  return (
    <div className="app-shell">
      <ConfigWarning />
      <div className="app-header">
        <Link to="/" className="app-brand">
          <span className="app-brand-dot" aria-hidden="true" />
          Trivia Night
        </Link>
        {/* Placeholder only - no settings page exists yet. A clean stock
            icon for now; swap for a custom hand-drawn version during the
            visual redesign. */}
        <button type="button" className="btn btn-ghost app-settings-button" aria-label="Settings">
          <Settings size={20} strokeWidth={2.25} />
        </button>
      </div>
      <main className="app-content">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default AppLayout;
