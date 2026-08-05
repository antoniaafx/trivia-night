/**
 * Rough, revisable-after-real-testing per-Question time estimates, used
 * only for the informational "~17 minutes" badge shown on a Deck in the
 * Deck Library/Picker (see deckRepository.ts/DeckPicker.tsx) - a
 * convenience for browsing content, not a scheduling input. There is no
 * game-level duration calculation anywhere in the app: every selected
 * Deck's Questions are all played, in order, and the only timer the
 * Host configures is the per-Question Question Timer below.
 */
export const QUESTION_SECONDS_ESTIMATE: Record<"multiple_choice" | "typed_answer", number> = {
  multiple_choice: 45,
  typed_answer: 60,
};

export const MAX_DECKS_PER_GAME = 5;

/**
 * The Question Timer choices offered in Game Setup - how long Players
 * get to answer each Question, applied uniformly to every Question in
 * the game (never per-Deck, per-Round, or per-answer-method). `null`
 * (offered as a separate "No Timer" option, not part of this array) is
 * a distinct fourth-plus choice meaning no countdown exists at all -
 * see utils/timer.ts and QuestionFlow's doc comment in utils/gamePlan.ts.
 */
export const QUESTION_TIMER_OPTIONS_SECONDS = [15, 30, 45, 60] as const;
export const QUESTION_TIMER_SECONDS_DEFAULT = 30;

/**
 * The other three ingredients of the Game Summary's "Estimated Time"
 * (see estimateGameDurationMinutes below), alongside the Question Timer
 * itself: how long a typical Reveal screen stays up before the Host
 * continues, the overhead of advancing to the next Question, and one
 * fixed cost for the end-of-game Leaderboard/winner screens. Same spirit
 * as QUESTION_SECONDS_ESTIMATE above - rough, revisable, never a
 * scheduling input, just an informational badge. Approximation is fine.
 */
export const REVEAL_SECONDS_ESTIMATE = 10;
export const QUESTION_TRANSITION_SECONDS_ESTIMATE = 5;
export const LEADERBOARD_SECONDS_ESTIMATE = 45;

/**
 * The blended per-Question answering time used only when no Question
 * Timer is configured (a Host-Controlled "No Timer" game has no fixed
 * answering duration to measure) - the average of the two per-answer-
 * method estimates above, since the Lobby doesn't yet know the mix of
 * Multiple Choice vs Typed Answer Questions in the selected Decks.
 */
const BLENDED_QUESTION_SECONDS_ESTIMATE =
  (QUESTION_SECONDS_ESTIMATE.multiple_choice + QUESTION_SECONDS_ESTIMATE.typed_answer) / 2;

/**
 * The Game Summary's "Estimated Time" - shown to both the Host
 * (GameSetupPhase) and every Player (Player Lobby) so everyone knows
 * roughly how long tonight's game will take before it starts. Deliberately
 * simple: (answering + Reveal + transition) per Question, plus one fixed
 * Leaderboard/winner overhead - no per-Deck or per-answer-method detail,
 * since neither page reliably has that breakdown available pre-game (a
 * Player never receives Question content before Start Game - see
 * RoomDeckSnapshot's own doc comment). Always rounds up to at least one
 * minute so a tiny/empty selection never reads as "0 Minutes".
 */
export function estimateGameDurationMinutes({
  questionCount,
  questionTimerSeconds,
}: {
  questionCount: number;
  questionTimerSeconds: number | null;
}): number {
  if (questionCount <= 0) return 0;
  const answeringSeconds = questionTimerSeconds ?? BLENDED_QUESTION_SECONDS_ESTIMATE;
  const perQuestionSeconds = answeringSeconds + REVEAL_SECONDS_ESTIMATE + QUESTION_TRANSITION_SECONDS_ESTIMATE;
  const totalSeconds = perQuestionSeconds * questionCount + LEADERBOARD_SECONDS_ESTIMATE;
  return Math.max(1, Math.round(totalSeconds / 60));
}

export function formatEstimatedDuration(minutes: number): string {
  if (minutes <= 0) return "—";
  return `~${minutes} Minute${minutes === 1 ? "" : "s"}`;
}
