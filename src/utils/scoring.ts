import type { Question } from "../data/questions";
import type { AnswerRecord, PlayerRecord } from "../types/game";

/**
 * Pure, dependency-free scoring rules. Kept separate from the
 * realtime/repository layer so they're easy to reason about (and reuse)
 * on their own: given the same answers and the same question, every
 * client computes the identical result - nobody has to trust a value a
 * client claims for itself.
 */

export function isAnswerCorrect(optionId: string | undefined, question: Question): boolean {
  return optionId !== undefined && optionId === question.correctOptionId;
}

export function scoreForAnswer(optionId: string | undefined, question: Question): number {
  return isAnswerCorrect(optionId, question) ? question.points : 0;
}

export interface AggregateReveal {
  answeredCount: number;
  correctCount: number;
  percentageCorrect: number; // 0-100, 0 when nobody answered
}

export function computeAggregateReveal(
  answers: AnswerRecord[],
  question: Question,
): AggregateReveal {
  const answeredCount = answers.length;
  const correctCount = answers.filter((answer) => isAnswerCorrect(answer.optionId, question)).length;
  const percentageCorrect = answeredCount === 0 ? 0 : Math.round((correctCount / answeredCount) * 100);

  return { answeredCount, correctCount, percentageCorrect };
}

/**
 * Highest score first; ties broken by earliest join time, then by
 * clientId as a final, fully deterministic tiebreaker (so the order
 * never depends on which client happens to compute it).
 */
export function sortLeaderboard(players: PlayerRecord[]): PlayerRecord[] {
  return [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const joinedDiff = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    if (joinedDiff !== 0) return joinedDiff;
    return a.clientId.localeCompare(b.clientId);
  });
}

/** Every player tied for the highest score - never an arbitrary single winner. */
export function computeWinners(players: PlayerRecord[]): PlayerRecord[] {
  if (players.length === 0) return [];
  const maxScore = Math.max(...players.map((player) => player.score));
  return players.filter((player) => player.score === maxScore);
}
