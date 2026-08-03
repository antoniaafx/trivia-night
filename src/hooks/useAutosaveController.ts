import { useCallback, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type SaveRun = (signal: AbortSignal) => Promise<void>;

interface AutosaveEntry {
  timer: ReturnType<typeof setTimeout> | null;
  controller: AbortController | null;
}

export interface AutosaveController {
  status: SaveStatus;
  /** Debounced write for text fields - coalesces rapid edits to the same key. */
  scheduleSave: (key: string, run: SaveRun, delayMs?: number) => void;
  /** Immediate write for structural changes (add/delete/reorder/duplicate) - no debounce. */
  saveNow: (key: string, run: SaveRun) => Promise<void>;
  /** Re-runs the most recently failed save, whichever key it was for. */
  retry: () => void;
}

const DEFAULT_DELAY_MS = 600;

/**
 * One save-status indicator per Deck (not per field) is the whole
 * autosave surface: "saving" while anything is pending or in flight
 * across any key, "saved" only once every outstanding write has
 * actually succeeded, "error" if any of them failed.
 *
 * Race protection has two parts, one per failure mode:
 *  - A key's *pending* (not yet fired) debounce timer is simply
 *    replaced when the same field changes again - the old attempt never
 *    runs, so its earlier "pending" count is settled immediately rather
 *    than waiting on a request that will never happen.
 *  - A key's *in-flight* request (timer already fired, awaiting the
 *    network) is genuinely aborted via AbortController when superseded,
 *    not just ignored - so a stale write can never land in Postgres
 *    after a newer one and silently overwrite it. Aborted requests are
 *    treated as superseded, not failures.
 */
export function useAutosaveController(defaultDelayMs = DEFAULT_DELAY_MS): AutosaveController {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const entriesRef = useRef(new Map<string, AutosaveEntry>());
  const pendingRef = useRef(0);
  const hadErrorRef = useRef(false);
  const lastFailedRef = useRef<{ key: string; run: SaveRun } | null>(null);

  const settleOne = useCallback((failed: boolean) => {
    pendingRef.current = Math.max(0, pendingRef.current - 1);
    if (failed) hadErrorRef.current = true;
    if (pendingRef.current === 0) {
      setStatus(hadErrorRef.current ? "error" : "saved");
      hadErrorRef.current = false;
    }
  }, []);

  const beginAttempt = useCallback((key: string): AutosaveEntry => {
    const entry = entriesRef.current.get(key) ?? { timer: null, controller: null };

    if (entry.timer !== null) {
      // Never fired - no async settlement will ever balance its earlier
      // increment, so it's settled here instead, immediately replaced.
      clearTimeout(entry.timer);
      entry.timer = null;
      settleOne(false);
    } else if (entry.controller) {
      // Already in flight - abort it; its own rejection settles it.
      entry.controller.abort();
      entry.controller = null;
    }

    pendingRef.current += 1;
    setStatus("saving");
    entriesRef.current.set(key, entry);
    return entry;
  }, [settleOne]);

  /**
   * Rethrows on a real (non-superseded) failure, after settling the
   * status - scheduleSave's fire-and-forget timer swallows that
   * rethrow (nothing is awaiting it there; the status badge already
   * reflects it), while saveNow's direct caller can still catch it to
   * react to one specific structural action failing (e.g. skip the
   * optimistic local-state update for a delete that didn't actually land).
   */
  const execute = useCallback(
    (key: string, entry: AutosaveEntry, run: SaveRun) => {
      entry.timer = null;
      const controller = new AbortController();
      entry.controller = controller;

      return run(controller.signal).then(
        () => {
          settleOne(false);
        },
        (err: unknown) => {
          if (controller.signal.aborted) {
            settleOne(false);
            return;
          }
          console.error(`Autosave failed for "${key}":`, err);
          lastFailedRef.current = { key, run };
          settleOne(true);
          throw err;
        },
      );
    },
    [settleOne],
  );

  const scheduleSave = useCallback(
    (key: string, run: SaveRun, delayMs = defaultDelayMs) => {
      const entry = beginAttempt(key);
      entry.timer = setTimeout(() => {
        execute(key, entry, run).catch(() => {
          // Status already reflects the failure; nothing here is awaiting this path.
        });
      }, delayMs);
    },
    [beginAttempt, execute, defaultDelayMs],
  );

  const saveNow = useCallback(
    async (key: string, run: SaveRun) => {
      const entry = beginAttempt(key);
      await execute(key, entry, run);
    },
    [beginAttempt, execute],
  );

  const retry = useCallback(() => {
    const last = lastFailedRef.current;
    if (!last) return;
    void saveNow(last.key, last.run);
  }, [saveNow]);

  return { status, scheduleSave, saveNow, retry };
}
