import { isSupabaseConfigured } from "../services/supabaseClient";
import "./ConfigWarning.css";

/**
 * Shown whenever no Supabase project is connected, in dev or in a
 * deployed build alike - every "unconfigured" state elsewhere in the
 * app (Host/Player/Stage connection status) tells the viewer to "see
 * the setup notice above", so that notice must actually exist
 * regardless of environment. The copy itself still differs: a local
 * dev server can just be restarted after editing `.env.local`, but a
 * deployed build's environment variables live in the hosting
 * platform's project settings and only take effect on the next build,
 * not a page refresh.
 */
function ConfigWarning() {
  if (isSupabaseConfigured) {
    return null;
  }

  return (
    <div className="config-warning" role="alert">
      <strong>Supabase is not configured.</strong>{" "}
      {import.meta.env.DEV ? (
        <>
          Add your project URL and anon key to <code>.env.local</code>, then restart the dev server (
          <code>npm run dev</code>). Realtime features won't connect until you do.
        </>
      ) : (
        <>This deployment is missing its Supabase environment variables. Set them in the hosting platform's project settings and redeploy.</>
      )}
    </div>
  );
}

export default ConfigWarning;
