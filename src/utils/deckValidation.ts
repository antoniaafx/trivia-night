import { normalizeAnswerText } from "./typedAnswer";
import type { DeckQuestionRecord } from "../types/deck";

export const MAX_POINTS = 1000;

export function isValidPoints(points: number): boolean {
  return Number.isInteger(points) && points > 0 && points <= MAX_POINTS;
}

/**
 * A Question may exist as an incomplete draft while a creator is still
 * writing it - these functions describe what "complete" means without
 * ever blocking the creator from leaving a draft unfinished. They're
 * only consulted before Preview/Host (see computeDeckReadiness).
 */
export function multipleChoiceQuestionIssues(question: DeckQuestionRecord): string[] {
  const issues: string[] = [];
  if (question.prompt.trim().length === 0) issues.push("needs a prompt");

  const nonEmptyOptions = (question.options ?? []).filter((option) => option.text.trim().length > 0);
  if (nonEmptyOptions.length < 2) issues.push("needs at least two answer options");

  const correctOptionIsUsable = (question.options ?? []).some(
    (option) => option.id === question.correctOptionId && option.text.trim().length > 0,
  );
  if (!correctOptionIsUsable) issues.push("needs a correct option marked");

  if (!isValidPoints(question.points)) issues.push("needs a valid point value");

  return issues;
}

export function typedAnswerQuestionIssues(question: DeckQuestionRecord): string[] {
  const issues: string[] = [];
  if (question.prompt.trim().length === 0) issues.push("needs a prompt");
  if (!question.correctAnswer || question.correctAnswer.trim().length === 0) issues.push("needs a correct answer");
  if (!isValidPoints(question.points)) issues.push("needs a valid point value");
  return issues;
}

export function questionIssues(question: DeckQuestionRecord): string[] {
  return question.answerMethod === "multiple_choice"
    ? multipleChoiceQuestionIssues(question)
    : typedAnswerQuestionIssues(question);
}

export function isQuestionComplete(question: DeckQuestionRecord): boolean {
  return questionIssues(question).length === 0;
}

export interface DeckReadiness {
  ready: boolean;
  /** e.g. "Question 2 needs a correct answer." - specific, never a generic "Invalid Question." */
  problems: string[];
}

export function computeDeckReadiness(questions: DeckQuestionRecord[]): DeckReadiness {
  if (questions.length === 0) {
    return { ready: false, problems: ["Add at least one Question before hosting."] };
  }

  const problems = questions.flatMap((question, index) =>
    questionIssues(question).map((issue) => `Question ${index + 1} ${issue}.`),
  );

  return { ready: problems.length === 0, problems };
}

/**
 * Trims blanks and drops normalized-duplicate variants (keeping the
 * first occurrence's original casing) - the same normalization the
 * grading engine itself uses, so "is this variant already covered"
 * matches "will this variant actually match" exactly.
 */
export function cleanAcceptedVariants(variants: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const variant of variants) {
    const trimmed = variant.trim();
    if (trimmed.length === 0) continue;
    const key = normalizeAnswerText(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }

  return cleaned;
}
