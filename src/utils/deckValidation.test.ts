import { describe, expect, it } from "vitest";
import { cleanAcceptedVariants, computeDeckReadiness, isQuestionComplete, questionIssues } from "./deckValidation";
import type { DeckQuestionRecord } from "../types/deck";

function makeMcQuestion(overrides: Partial<DeckQuestionRecord> = {}): DeckQuestionRecord {
  return {
    id: "q-mc-1",
    deckId: "deck-1",
    position: 1000,
    answerMethod: "multiple_choice",
    prompt: "What is the capital of Australia?",
    points: 100,
    options: [
      { id: "a", text: "Sydney" },
      { id: "b", text: "Canberra" },
    ],
    correctOptionId: "b",
    correctAnswer: null,
    acceptedAnswers: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeTypedQuestion(overrides: Partial<DeckQuestionRecord> = {}): DeckQuestionRecord {
  return {
    id: "q-typed-1",
    deckId: "deck-1",
    position: 2000,
    answerMethod: "typed_answer",
    prompt: "Who wrote Romeo and Juliet?",
    points: 100,
    options: null,
    correctOptionId: null,
    correctAnswer: "William Shakespeare",
    acceptedAnswers: ["Shakespeare"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("multipleChoiceQuestionIssues (via questionIssues)", () => {
  it("is complete when prompt, two options, and a correct option all exist", () => {
    expect(questionIssues(makeMcQuestion())).toEqual([]);
  });

  it("flags a blank prompt", () => {
    expect(questionIssues(makeMcQuestion({ prompt: "   " }))).toContain("needs a prompt");
  });

  it("flags fewer than two non-empty options", () => {
    const question = makeMcQuestion({ options: [{ id: "a", text: "Only one" }], correctOptionId: "a" });
    expect(questionIssues(question)).toContain("needs at least two answer options");
  });

  it("does not count a blank option toward the two-option minimum", () => {
    const question = makeMcQuestion({
      options: [
        { id: "a", text: "Sydney" },
        { id: "b", text: "  " },
      ],
      correctOptionId: "a",
    });
    expect(questionIssues(question)).toContain("needs at least two answer options");
  });

  it("flags no correct option marked", () => {
    expect(questionIssues(makeMcQuestion({ correctOptionId: null }))).toContain("needs a correct option marked");
  });

  it("flags a correct option pointing at a blank/removed option", () => {
    const question = makeMcQuestion({
      options: [
        { id: "a", text: "Sydney" },
        { id: "b", text: "" },
      ],
      correctOptionId: "b",
    });
    expect(questionIssues(question)).toContain("needs a correct option marked");
  });

  it("flags an invalid point value", () => {
    expect(questionIssues(makeMcQuestion({ points: 0 }))).toContain("needs a valid point value");
    expect(questionIssues(makeMcQuestion({ points: -10 }))).toContain("needs a valid point value");
    expect(questionIssues(makeMcQuestion({ points: 1.5 }))).toContain("needs a valid point value");
  });
});

describe("typedAnswerQuestionIssues (via questionIssues)", () => {
  it("is complete with a prompt, correct answer, and valid points", () => {
    expect(questionIssues(makeTypedQuestion())).toEqual([]);
  });

  it("flags a blank correct answer", () => {
    expect(questionIssues(makeTypedQuestion({ correctAnswer: "" }))).toContain("needs a correct answer");
    expect(questionIssues(makeTypedQuestion({ correctAnswer: null }))).toContain("needs a correct answer");
  });

  it("does not require any accepted variants", () => {
    expect(questionIssues(makeTypedQuestion({ acceptedAnswers: [] }))).toEqual([]);
  });
});

describe("isQuestionComplete", () => {
  it("is true for a complete question of either method", () => {
    expect(isQuestionComplete(makeMcQuestion())).toBe(true);
    expect(isQuestionComplete(makeTypedQuestion())).toBe(true);
  });

  it("is false for an incomplete question", () => {
    expect(isQuestionComplete(makeMcQuestion({ correctOptionId: null }))).toBe(false);
    expect(isQuestionComplete(makeTypedQuestion({ correctAnswer: "" }))).toBe(false);
  });
});

describe("computeDeckReadiness", () => {
  it("is not ready with zero Questions", () => {
    const readiness = computeDeckReadiness([]);
    expect(readiness.ready).toBe(false);
    expect(readiness.problems).toEqual(["Add at least one Question before hosting."]);
  });

  it("is ready when every Question is complete", () => {
    const readiness = computeDeckReadiness([makeMcQuestion(), makeTypedQuestion()]);
    expect(readiness).toEqual({ ready: true, problems: [] });
  });

  it("produces a specific, numbered problem message, not a generic one", () => {
    const readiness = computeDeckReadiness([makeMcQuestion(), makeTypedQuestion({ correctAnswer: "" })]);
    expect(readiness.ready).toBe(false);
    expect(readiness.problems).toEqual(["Question 2 needs a correct answer."]);
  });

  it("reports every problem across multiple incomplete Questions", () => {
    const readiness = computeDeckReadiness([
      makeMcQuestion({ correctOptionId: null }),
      makeTypedQuestion({ correctAnswer: "" }),
    ]);
    expect(readiness.problems).toEqual(["Question 1 needs a correct option marked.", "Question 2 needs a correct answer."]);
  });
});

describe("cleanAcceptedVariants", () => {
  it("trims whitespace and drops blank entries", () => {
    expect(cleanAcceptedVariants(["  Shakespeare  ", "", "   "])).toEqual(["Shakespeare"]);
  });

  it("drops normalized-duplicate variants, keeping the first casing", () => {
    expect(cleanAcceptedVariants(["Shakespeare", "shakespeare", "SHAKESPEARE"])).toEqual(["Shakespeare"]);
  });

  it("treats 'W Shakespeare' and 'W. Shakespeare' as the same normalized variant (period is stripped), keeping only the first", () => {
    expect(cleanAcceptedVariants(["W Shakespeare", "W. Shakespeare"])).toEqual(["W Shakespeare"]);
  });

  it("keeps genuinely distinct variants", () => {
    expect(cleanAcceptedVariants(["Shakespeare", "The Bard", "W Shakespeare"])).toEqual([
      "Shakespeare",
      "The Bard",
      "W Shakespeare",
    ]);
  });
});
