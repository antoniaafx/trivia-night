import { useEffect, useState } from "react";
import { computeRemainingSeconds } from "../utils/timer";
import type { TimerStatus } from "../types/game";

/**
 * The single hook Host/Player/Stage all use to render a live countdown -
 * ticks a local re-render once a second only while `timerStatus` is
 * "running" (a paused/not-started/expired timer never needs a re-render
 * to stay correct, since computeRemainingSeconds returns a fixed value
 * for those). The tick is purely cosmetic: it never advances the
 * authoritative value itself, only re-invokes computeRemainingSeconds
 * against the current wall clock so the displayed number stays in sync
 * with what a fresh page load would also compute right now.
 *
 * Returns a whole-second integer, or null when there's no timer
 * configured for this game (see computeRemainingSeconds).
 */
export function useCountdown(
  timerStatus: TimerStatus,
  timerStartedAt: string | null,
  timerRemainingSeconds: number | null,
): number | null {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (timerStatus !== "running") return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timerStatus]);

  const remaining = computeRemainingSeconds(timerStatus, timerStartedAt, timerRemainingSeconds, nowMs);
  return remaining === null ? null : Math.ceil(remaining);
}
