import { isSupabaseConfigured } from "../services/supabaseClient";
import "./ConfigWarning.css";

/**
 * Dev-only notice shown when no Supabase project is connected. Never
 * renders in a production build (import.meta.env.DEV is statically
 * false there, so this branch is stripped at build time) - a deployed
 * app is expected to have its environment configured by the host
 * platform, not by a developer restarting a local dev server.
 */
function ConfigWarning() {
  if (!import.meta.env.DEV || isSupabaseConfigured) {
    return null;
  }

  return (
    <div className="config-warning" role="alert">
      <strong>Supabase is not configured.</strong> Add your project URL and
      anon key to <code>.env.local</code>, then restart the dev server
      (<code>npm run dev</code>). Realtime features won't connect until you do.
    </div>
  );
}

export default ConfigWarning;
