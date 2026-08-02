import { describe, expect, it } from "vitest";
import {
  fuzzyThresholdForLength,
  gradeTypedAnswer,
  isExactMatch,
  isPossibleTypo,
  levenshteinDistance,
  normalizeAnswerText,
} from "./typedAnswer";
import type { TypedAnswerQuestion } from "../data/questions";

const question: TypedAnswerQuestion = {
  id: "q2",
  answerMethod: "typed_answer",
  prompt: "Who wrote Romeo and Juliet?",
  points: 100,
  correctAnswer: "William Shakespeare",
  acceptedAnswers: ["Shakespeare", "W Shakespeare", "W. Shakespeare"],
};

describe("normalizeAnswerText", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeAnswerText("  William Shakespeare  ")).toBe("william shakespeare");
  });

  it("collapses repeated internal whitespace", () => {
    expect(normalizeAnswerText("William    Shakespeare")).toBe("william shakespeare");
  });

  it("is case-insensitive", () => {
    expect(normalizeAnswerText("WILLIAM SHAKESPEARE")).toBe("william shakespeare");
  });

  it("strips accents/diacritics", () => {
    expect(normalizeAnswerText("café")).toBe("cafe");
    expect(normalizeAnswerText("Molière")).toBe("moliere");
  });

  it("normalizes curly/backtick apostrophe variants to a plain apostrophe", () => {
    expect(normalizeAnswerText("don’t")).toBe("don't");
    expect(normalizeAnswerText("don`t")).toBe("don't");
    expect(normalizeAnswerText("don´t")).toBe("don't");
  });

  it("drops harmless punctuation (periods, commas)", () => {
    expect(normalizeAnswerText("W. Shakespeare")).toBe("w shakespeare");
    expect(normalizeAnswerText("Shakespeare,")).toBe("shakespeare");
  });

  it("converges every documented example to the same normalized form", () => {
    const variants = ["William Shakespeare", "william shakespeare", "  William   Shakespeare", "WILLIAM SHAKESPEARE"];
    const normalized = variants.map(normalizeAnswerText);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe("william shakespeare");
  });
});

describe("levenshteinDistance", () => {
  it("is 0 for identical strings", () => {
    expect(levenshteinDistance("shakespeare", "shakespeare")).toBe(0);
  });

  it("counts a single substitution as distance 1", () => {
    expect(levenshteinDistance("cat", "cot")).toBe(1);
  });

  it("counts a single deletion as distance 1", () => {
    expect(levenshteinDistance("shakespeare", "shakespear")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });
});

describe("fuzzyThresholdForLength", () => {
  it("allows no leniency for short strings (<= 4 chars)", () => {
    expect(fuzzyThresholdForLength(4)).toBe(0);
  });

  it("allows 1 edit for medium-short strings (5-7 chars)", () => {
    expect(fuzzyThresholdForLength(7)).toBe(1);
  });

  it("allows 2 edits for medium strings (8-11 chars)", () => {
    expect(fuzzyThresholdForLength(11)).toBe(2);
  });

  it("allows 3 edits for long strings (12+ chars)", () => {
    expect(fuzzyThresholdForLength(20)).toBe(3);
  });
});

describe("isExactMatch", () => {
  it("matches the canonical correct answer", () => {
    expect(isExactMatch("William Shakespeare", question)).toBe(true);
  });

  it("matches an accepted variant", () => {
    expect(isExactMatch("Shakespeare", question)).toBe(true);
    expect(isExactMatch("W Shakespeare", question)).toBe(true);
  });

  it("matches after normalization (case, whitespace, punctuation)", () => {
    expect(isExactMatch("  w. shakespeare  ", question)).toBe(true);
  });

  it("does not match an unrelated answer", () => {
    expect(isExactMatch("Christopher Marlowe", question)).toBe(false);
  });

  it("is unaffected by duplicate accepted variants", () => {
    const withDuplicates: TypedAnswerQuestion = {
      ...question,
      acceptedAnswers: ["Shakespeare", "Shakespeare", "shakespeare"],
    };
    expect(isExactMatch("Shakespeare", withDuplicates)).toBe(true);
  });

  it("ignores blank accepted variants rather than matching everything", () => {
    const withBlank: TypedAnswerQuestion = { ...question, acceptedAnswers: ["Shakespeare", "   "] };
    expect(isExactMatch("   ", withBlank)).toBe(false);
    expect(isExactMatch("", withBlank)).toBe(false);
  });
});

describe("isPossibleTypo / gradeTypedAnswer - documented worked examples", () => {
  it('"Shakespear" (missing trailing e) is flagged as a possible typo, not auto-accepted or auto-rejected', () => {
    expect(isExactMatch("Shakespear", question)).toBe(false);
    expect(isPossibleTypo("Shakespear", question)).toBe(true);
    expect(gradeTypedAnswer("Shakespear", question)).toBe("pending_review");
  });

  it('"Shake" is far enough from every accepted variant to be incorrect, not a typo', () => {
    expect(isPossibleTypo("Shake", question)).toBe(false);
    expect(gradeTypedAnswer("Shake", question)).toBe("incorrect");
  });

  it('"Christopher Marlowe" is a clear mismatch, never flagged as a typo', () => {
    expect(isPossibleTypo("Christopher Marlowe", question)).toBe(false);
    expect(gradeTypedAnswer("Christopher Marlowe", question)).toBe("incorrect");
  });

  it("grades an exact match as correct, bypassing review entirely", () => {
    expect(gradeTypedAnswer("William Shakespeare", question)).toBe("correct");
    expect(gradeTypedAnswer("shakespeare", question)).toBe("correct");
  });
});

describe("isPossibleTypo - short-answer strict thresholds", () => {
  const shortQuestion: TypedAnswerQuestion = {
    id: "q-short",
    answerMethod: "typed_answer",
    prompt: "Domestic cat, in one word?",
    points: 100,
    correctAnswer: "Cat",
    acceptedAnswers: [],
  };

  it("never flags a 1-edit difference from a <=4 character answer as a typo", () => {
    // "Cat" (len 3) threshold is 0 - any difference is a clear mismatch, not a review candidate.
    expect(isPossibleTypo("Bat", shortQuestion)).toBe(false);
    expect(gradeTypedAnswer("Bat", shortQuestion)).toBe("incorrect");
  });

  it("still grades the exact short answer as correct", () => {
    expect(gradeTypedAnswer("cat", shortQuestion)).toBe("correct");
  });
});
