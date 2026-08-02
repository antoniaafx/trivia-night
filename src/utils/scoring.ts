import type { Question } from "../data/questions";
import type { Competitor } from "../types/game";

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

export function isAnswerCorrect(optionId: string | undefined, question: Question): boolean {
  return optionId !== undefined && optionId === question.correctOptionId;
}

export function scoreForAnswer(optionId: string | undefined, question: Question): number {
  return isAnswerCorrect(optionId, question) ? question.points : 0;
}

/** Anything with an optionId - AnswerRecord and TeamAnswerRecord both qualify without a cast. */
export interface AnswerLike {
  optionId: string;
}

export interface AggregateReveal {
  answeredCount: number;
  correctCount: number;
  percentageCorrect: number; // 0-100, 0 when nobody answered
}

export function computeAggregateReveal(answers: AnswerLike[], question: Question): AggregateReveal {
  const answeredCount = answers.length;
  const correctCount = answers.filter((answer) => isAnswerCorrect(answer.optionId, question)).length;
  const percentageCorrect = answeredCount === 0 ? 0 : Math.round((correctCount / answeredCount) * 100);

  return { answeredCount, correctCount, percentageCorrect };
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
