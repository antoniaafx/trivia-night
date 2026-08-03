/**
 * The single place Question-timing estimates live, so Game Plan
 * allocation never scatters "how long does a Question take" through
 * components. These are deliberately rough, revisable-after-real-
 * testing estimates for the whole rhythm of one Question - reading,
 * discussion, submission, reveal, and the transition to the next one
 * - not just the raw answering time.
 *
 * The displayed/estimated total game duration represents Question time
 * plus a small fixed allowance for each Deck-to-Deck section
 * transition - not the final Leaderboard/Winner ceremony, which has no
 * fixed length of its own. This is a deliberate choice (see the
 * Milestone 5 report): the estimate is "approximately how long the
 * playable Question content takes," always shown with "approximately,"
 * never claimed to be second-perfect.
 */
export const QUESTION_SECONDS_ESTIMATE: Record<"multiple_choice" | "typed_answer", number> = {
  multiple_choice: 45,
  typed_answer: 60,
};

/** A small fixed allowance for the "Deck 2 of 3" beat between sections - not per-Question, only between sections. */
export const SECTION_TRANSITION_SECONDS_ESTIMATE = 15;

export const GAME_DURATION_MINUTES_MIN = 5;
export const GAME_DURATION_MINUTES_MAX = 120;
export const GAME_DURATION_MINUTES_DEFAULT = 30;
export const GAME_DURATION_PRESETS_MINUTES = [10, 20, 30, 45, 60];

export const MAX_DECKS_PER_GAME = 5;
