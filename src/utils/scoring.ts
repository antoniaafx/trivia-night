import type { Question } from "../data/questions";
import type { Competitor, GradingStatus } from "../types/game";
import { gradeTypedAnswer } from "./typedAnswer";

/**
 * Pure, dependency-free scoring/ranking rules, shared by Solo and Team
 * Mode alike. Kept separate from the realtime/repository layer so
 * they're easy to reason about (and test) on their own: given the same
 * inputs, every client computes the identical result - nobody has to
 * trust a value a client claims for itself.
 *
 * Everything below operates on the shared Competitor shape
 * (types/game.ts), not on PlayerRecord or TeamRecord directly - this is
 * what lets Solo and Team Mode share one scoring/ranking/winner
 * implementation instead of two parallel ones.
 */

/** Whatever a competitor actually submitted, regardless of answer method - exactly one field is ever set. */
export interface SubmittedAnswer {
  optionId: string | null;
  textAnswer: string | null;
}

/**
 * The single dispatch point between answer methods: Multiple Choice
 * grades instantly by comparing option ids; Typed Answer runs through
 * normalization/accepted-answer/fuzzy-typo logic. Everything downstream
 * (aggregate reveal, per-viewer feedback, scoring) reads the
 * GradingStatus this returns rather than re-deriving correctness from
 * raw option ids or text, so there is exactly one place answer-method
 * logic lives.
 */
export function gradeSubmission(question: Question, answer: SubmittedAnswer): GradingStatus {
  if (question.answerMethod === "multiple_choice") {
    if (answer.optionId === null) return "incorrect";
    return answer.optionId === question.correctOptionId ? "correct" : "incorrect";
  }

  if (answer.textAnswer === null) return "incorrect";
  return gradeTypedAnswer(answer.textAnswer, question);
}

/** pending_review is provisional 0 until a Host resolves it - never awarded automatically. */
export function pointsForGrade(status: GradingStatus, question: Question): number {
  return status === "correct" ? question.points : 0;
}

/**
 * A competitor's total score is always this sum, recomputed from
 * scratch over every answer row they have for the current game
 * instance (across every question, not just the one just graded) -
 * never an incrementing running total. That is what makes score
 * reconciliation idempotent: summing the same rows twice gives the
 * same total, and a Host flipping one row's points_awarded (Accept ->
 * Reject or back) is reflected correctly the next time this runs,
 * never stacked on top of the previous value.
 */
export function sumPointsAwarded(answers: { pointsAwarded: number }[]): number {
  return answers.reduce((total, answer) => total + answer.pointsAwarded, 0);
}

/** Anything with a gradingStatus - AnswerRecord and TeamAnswerRecord both qualify without a cast. */
export interface GradedLike {
  gradingStatus: GradingStatus;
}

export interface AggregateReveal {
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  pendingCount: number;
  /**
   * resolvedCorrect / resolvedTotal - pending-review answers are held
   * out of this percentage entirely (not counted as wrong, not counted
   * as right) rather than folded into either side, so the number never
   * misrepresents an outcome that isn't decided yet. pendingCount is
   * always shown alongside it, never hidden inside the percentage.
   */
  percentageCorrect: number;
}

export function computeAggregateReveal(answers: GradedLike[]): AggregateReveal {
  const answeredCount = answers.length;
  const correctCount = answers.filter((answer) => answer.gradingStatus === "correct").length;
  const incorrectCount = answers.filter((answer) => answer.gradingStatus === "incorrect").length;
  const pendingCount = answers.filter((answer) => answer.gradingStatus === "pending_review").length;
  const resolvedTotal = correctCount + incorrectCount;
  const percentageCorrect = resolvedTotal === 0 ? 0 : Math.round((correctCount / resolvedTotal) * 100);

  return { answeredCount, correctCount, incorrectCount, pendingCount, percentageCorrect };
}

/**
 * Highest score first; ties broken by earliest tiebreakAt (join time for
 * a player, creation time for a team), then by id as a final, fully
 * deterministic tiebreaker so the order never depends on which client
 * happens to compute it.
 */
export function sortLeaderboard(competitors: Competitor[]): Competitor[] {
  return [...competitors].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const tiebreakDiff = new Date(a.tiebreakAt).getTime() - new Date(b.tiebreakAt).getTime();
    if (tiebreakDiff !== 0) return tiebreakDiff;
    return a.id.localeCompare(b.id);
  });
}

/** Every competitor tied for the highest score - never an arbitrary single winner. */
export function computeWinners(competitors: Competitor[]): Competitor[] {
  if (competitors.length === 0) return [];
  const maxScore = Math.max(...competitors.map((competitor) => competitor.score));
  return competitors.filter((competitor) => competitor.score === maxScore);
}

const TEAM_NAME_MAX_LENGTH = 30;

/**
 * Mirrors the database's generated `normalized_name` column exactly
 * (`lower(btrim(name))`) so a client-side "is this name available"
 * check never disagrees with what the unique constraint will actually
 * enforce.
 */
export function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase();
}

export type TeamNameValidation = { valid: true } | { valid: false; reason: string };

export function validateTeamName(name: string): TeamNameValidation {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: "Enter a team name." };
  }
  if (trimmed.length > TEAM_NAME_MAX_LENGTH) {
    return { valid: false, reason: `Team names can be at most ${TEAM_NAME_MAX_LENGTH} characters.` };
  }
  return { valid: true };
}

/**
 * The stale-instance guard used whenever a realtime event arrives for an
 * answer/team-answer row: an event belongs to the current game unless
 * its game_instance_id has been superseded by a newer Play Again.
 */
export function isEventForCurrentInstance(eventInstanceId: string, currentInstanceId: string | null): boolean {
  return currentInstanceId !== null && eventInstanceId === currentInstanceId;
}

/**
 * Same reasoning as isEventForCurrentInstance, one level more specific:
 * an answer event belongs to the question currently on screen unless
 * the room has already advanced to a different question (or back to
 * lobby, where currentQuestionId is null).
 */
export function isEventForCurrentQuestion(eventQuestionId: string, currentQuestionId: string | null): boolean {
  return currentQuestionId !== null && eventQuestionId === currentQuestionId;
}
