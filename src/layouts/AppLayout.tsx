import { Outlet, Link } from "react-router-dom";
import ConfigWarning from "../components/ConfigWarning";
import "./AppLayout.css";

function AppLayout() {
  return (
    <div className="app-shell">
      <ConfigWarning />
      <Link to="/" className="app-brand">
        <span className="app-brand-dot" aria-hidden="true" />
        Trivia Night
      </Link>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
