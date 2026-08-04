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
