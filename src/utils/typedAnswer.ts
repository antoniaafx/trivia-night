import type { TypedAnswerQuestion } from "../data/questions";

/**
 * Tier 1 normalization: trims, collapses internal whitespace,
 * case-folds, strips accents/diacritics (Unicode NFD decomposition then
 * dropping combining marks), folds curly/backtick apostrophe variants to
 * a plain `'`, and drops harmless punctuation (periods, commas) so
 * abbreviation styles like "W. Shakespeare" and "W Shakespeare" converge
 * to the same normalized form. Deliberately does not attempt semantic
 * equivalence, and does not implement numeric-formatting normalization
 * yet - that is explicitly deferred to a future Numeric Mode, not part
 * of this milestone.
 */
const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;
const APOSTROPHE_VARIANTS = /[‘’´`]/g;

export function normalizeAnswerText(input: string): string {
  return input
    .normalize("NFD")
    .replace(COMBINING_MARKS_PATTERN, "")
    .replace(APOSTROPHE_VARIANTS, "'")
    .replace(/[.,]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Filters out blank/whitespace-only variants - the configuration-time validation the spec asks for. */
function acceptableVariants(question: TypedAnswerQuestion): string[] {
  return [question.correctAnswer, ...question.acceptedAnswers]
    .map(normalizeAnswerText)
    .filter((variant) => variant.length > 0);
}

export function isExactMatch(submitted: string, question: TypedAnswerQuestion): boolean {
  const normalizedSubmitted = normalizeAnswerText(submitted);
  return acceptableVariants(question).includes(normalizedSubmitted);
}

/** Plain iterative Levenshtein edit distance - deterministic, no external dependency. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/**
 * Shorter answers get a stricter (smaller) allowed edit distance: a
 * one-character slip on a 20-character name is a typo, but a
 * one-character difference between two 4-character words is just as
 * likely to be a genuinely different word. Thresholds are deliberately
 * conservative and documented here rather than tuned per question:
 *
 *   length <= 4  -> 0 (no fuzzy leniency; must match exactly)
 *   length 5-7   -> 1
 *   length 8-11  -> 2
 *   length 12+   -> 3
 */
export function fuzzyThresholdForLength(length: number): number {
  if (length <= 4) return 0;
  if (length <= 7) return 1;
  if (length <= 11) return 2;
  return 3;
}

/**
 * A "possible typo" is close to *some* accepted variant, within that
 * variant's own length-sensitive threshold, but not an exact match
 * (exact matches are handled by isExactMatch and never reach here in
 * practice). This never awards points by itself - it only flags the
 * answer for Host review. Compares against every accepted variant
 * independently (not just the canonical correct answer) so a typo of a
 * short accepted nickname is judged by its own length, not the full
 * correct answer's length.
 */
export function isPossibleTypo(submitted: string, question: TypedAnswerQuestion): boolean {
  const normalizedSubmitted = normalizeAnswerText(submitted);
  return acceptableVariants(question).some((variant) => {
    const distance = levenshteinDistance(normalizedSubmitted, variant);
    if (distance === 0) return false;
    return distance <= fuzzyThresholdForLength(variant.length);
  });
}

export type TypedAnswerGrade = "correct" | "incorrect" | "pending_review";

export function gradeTypedAnswer(submitted: string, question: TypedAnswerQuestion): TypedAnswerGrade {
  if (isExactMatch(submitted, question)) return "correct";
  if (isPossibleTypo(submitted, question)) return "pending_review";
  return "incorrect";
}
