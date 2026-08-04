import type { QuestionFlow } from "./gamePlan";
import type { TimerStatus } from "../types/game";

/**
 * The one place that turns the room's server-authoritative timer
 * columns into "how many seconds are left, right now" - called
 * identically by the Host, a Player, the Stage, a fresh page load, and
 * a reconnecting client, so every one of them always converges on the
 * same number without any client ever trusting its own memory of a
 * previous tick. `nowMs` is passed in (rather than read internally via
 * Date.now()) purely so this stays a pure, testable function - callers
 * pass the real clock.
 *
 * Deliberately does NOT read a live decrementing value off the wire:
 * only `timerStartedAt` (a fixed server timestamp) and
 * `timerRemainingSeconds` (the baseline as of that timestamp) are
 * authoritative. Every client computes its own live countdown by
 * subtracting elapsed wall-clock time from that baseline - small clock
 * differences between devices are the only source of disagreement, and
 * they're negligible at one-second granularity. This is what makes
 * refresh recovery and late joins trivial: whatever the current
 * `timerRemainingSeconds`/`timerStartedAt`/`timerStatus` are on the room
 * row IS the answer, with no separate recovery path to get wrong.
 *
 * Returns null when there is no timer configured for this game at all
 * (`timerRemainingSeconds === null`, the No Timer case) - callers use
 * this to decide whether to render any timer UI in the first place.
 */
export function computeRemainingSeconds(
  timerStatus: TimerStatus,
  timerStartedAt: string | null,
  timerRemainingSeconds: number | null,
  nowMs: number,
): number | null {
  if (timerRemainingSeconds === null) return null;

  if (timerStatus === "expired") return 0;
  if (timerStatus === "not_started" || timerStatus === "paused") return timerRemainingSeconds;

  // "running"
  if (!timerStartedAt) return timerRemainingSeconds;
  const elapsedSeconds = (nowMs - new Date(timerStartedAt).getTime()) / 1000;
  return Math.max(0, timerRemainingSeconds - elapsedSeconds);
}

/** Shared by Host/Player/Stage so a countdown always reads identically everywhere - e.g. "00:18". */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export interface InitialTimerFields {
  timer_status: TimerStatus;
  timer_started_at: string | null;
  timer_remaining_seconds: number | null;
}

/**
 * What the timer columns reset to the moment a new Question begins -
 * used by both Start Game's first Question and advanceQuestion's next
 * one, so the two call sites can never drift out of sync on this logic.
 * With no timer configured, the fields are simply inert (status stays
 * "not_started" but nothing ever reads it, since every timer UI is
 * gated on `questionTimerSeconds !== null` first).
 */
export function computeInitialTimerFields(
  questionTimerSeconds: number | null,
  questionFlow: QuestionFlow,
): InitialTimerFields {
  if (questionTimerSeconds === null) {
    return { timer_status: "not_started", timer_started_at: null, timer_remaining_seconds: null };
  }

  if (questionFlow === "automatic") {
    return {
      timer_status: "running",
      timer_started_at: new Date().toISOString(),
      timer_remaining_seconds: questionTimerSeconds,
    };
  }

  return { timer_status: "not_started", timer_started_at: null, timer_remaining_seconds: questionTimerSeconds };
}
