import { describe, expect, it } from "vitest";
import {
  computeGamePlan,
  computeGamePlanWarnings,
  computePlanSummary,
  deriveLobbyStage,
  findSectionForQuestion,
  parseRoomDeckSnapshot,
  selectQuestionsForBudget,
  validateDeckSelection,
} from "./gamePlan";
import type { DeckPlanInput, PlannedGame } from "./gamePlan";
import { MAX_DECKS_PER_GAME, QUESTION_SECONDS_ESTIMATE, SECTION_TRANSITION_SECONDS_ESTIMATE } from "../config/timingEstimates";
import type { DeckQuestionRecord } from "../types/deck";

function makeQuestion(id: string, answerMethod: "multiple_choice" | "typed_answer" = "multiple_choice"): DeckQuestionRecord {
  return {
    id,
    deckId: "deck",
    position: 0,
    answerMethod,
    prompt: `Prompt ${id}`,
    points: 100,
    options:
      answerMethod === "multiple_choice"
        ? [
            { id: "a", text: "A" },
            { id: "b", text: "B" },
          ]
        : null,
    correctOptionId: answerMethod === "multiple_choice" ? "a" : null,
    correctAnswer: answerMethod === "typed_answer" ? "Answer" : null,
    acceptedAnswers: answerMethod === "typed_answer" ? [] : null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeQuestions(count: number, prefix: string, answerMethod: "multiple_choice" | "typed_answer" = "multiple_choice") {
  return Array.from({ length: count }, (_, i) => makeQuestion(`${prefix}-${i + 1}`, answerMethod));
}

const MC_SECONDS = QUESTION_SECONDS_ESTIMATE.multiple_choice;

describe("selectQuestionsForBudget", () => {
  it("always includes at least the first Question, even if it alone exceeds the budget", () => {
    const questions = makeQuestions(1, "q");
    const result = selectQuestionsForBudget(questions, 1);
    expect(result.selectedIds).toEqual(["q-1"]);
    expect(result.usedSeconds).toBe(MC_SECONDS);
  });

  it("stops before exceeding the budget once at least one Question is selected", () => {
    const questions = makeQuestions(5, "q");
    const budget = MC_SECONDS * 2;
    const result = selectQuestionsForBudget(questions, budget);
    expect(result.selectedIds).toEqual(["q-1", "q-2"]);
    expect(result.usedSeconds).toBe(MC_SECONDS * 2);
  });

  it("includes every Question when the whole Deck fits the budget", () => {
    const questions = makeQuestions(3, "q");
    const result = selectQuestionsForBudget(questions, MC_SECONDS * 10);
    expect(result.selectedIds).toEqual(["q-1", "q-2", "q-3"]);
  });

  it("never reorders or duplicates Questions", () => {
    const questions = makeQuestions(4, "q");
    const result = selectQuestionsForBudget(questions, MC_SECONDS * 4);
    expect(result.selectedIds).toEqual(["q-1", "q-2", "q-3", "q-4"]);
    expect(new Set(result.selectedIds).size).toBe(result.selectedIds.length);
  });
});

describe("validateDeckSelection", () => {
  function planInput(deckId: string, count: number): DeckPlanInput {
    return { deckId, deckTitle: deckId, questions: makeQuestions(count, deckId) };
  }

  it("rejects zero Decks", () => {
    expect(validateDeckSelection([])).toEqual({ valid: false, reason: "Choose at least one Deck." });
  });

  it("accepts exactly the maximum number of Decks", () => {
    const decks = Array.from({ length: MAX_DECKS_PER_GAME }, (_, i) => planInput(`d${i}`, 3));
    expect(validateDeckSelection(decks)).toEqual({ valid: true });
  });

  it("rejects one more than the maximum number of Decks", () => {
    const decks = Array.from({ length: MAX_DECKS_PER_GAME + 1 }, (_, i) => planInput(`d${i}`, 3));
    const result = validateDeckSelection(decks);
    expect(result.valid).toBe(false);
  });

  it("rejects a selection with no Questions at all", () => {
    const decks = [planInput("d1", 0), planInput("d2", 0)];
    expect(validateDeckSelection(decks)).toEqual({
      valid: false,
      reason: "The selected Decks don't contain any Questions yet.",
    });
  });
});

describe("computeGamePlan - equal allocation", () => {
  it("gives a single Deck the entire target duration", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Movies", questions: makeQuestions(20, "q") }];
    const plan = computeGamePlan(decks, 600);
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0].allocatedSeconds).toBe(600);
  });

  it("splits evenly across two Decks with plenty of content", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "d1", deckTitle: "Movies", questions: makeQuestions(20, "m") },
      { deckId: "d2", deckTitle: "Music", questions: makeQuestions(20, "s") },
    ];
    const plan = computeGamePlan(decks, 600);
    expect(plan.sections[0].allocatedSeconds).toBe(300);
    expect(plan.sections[1].allocatedSeconds).toBe(300);
  });

  it("distributes an uneven remainder deterministically to earlier Decks first", () => {
    // 601 seconds across 3 Decks: base 200, remainder 1 -> [201, 200, 200].
    const decks: DeckPlanInput[] = [
      { deckId: "d1", deckTitle: "A", questions: makeQuestions(20, "a") },
      { deckId: "d2", deckTitle: "B", questions: makeQuestions(20, "b") },
      { deckId: "d3", deckTitle: "C", questions: makeQuestions(20, "c") },
    ];
    const plan = computeGamePlan(decks, 601);
    const allocations = plan.sections.map((s) => s.allocatedSeconds);
    expect(allocations).toEqual([201, 200, 200]);
    expect(allocations.reduce((a, b) => a + b, 0)).toBe(601);
  });

  it("is deterministic - identical inputs always produce an identical plan", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "d1", deckTitle: "Movies", questions: makeQuestions(7, "m") },
      { deckId: "d2", deckTitle: "Music", questions: makeQuestions(5, "s", "typed_answer") },
    ];
    const first = computeGamePlan(decks, 600);
    const second = computeGamePlan(decks, 600);
    expect(first).toEqual(second);
  });

  it("preserves selected-Deck order and each Deck's own saved Question order", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "d2", deckTitle: "Music", questions: makeQuestions(20, "s") },
      { deckId: "d1", deckTitle: "Movies", questions: makeQuestions(20, "m") },
    ];
    const plan = computeGamePlan(decks, 600);
    expect(plan.sections.map((s) => s.deckId)).toEqual(["d2", "d1"]);
    expect(plan.sections[0].questionIds).toEqual([...plan.sections[0].questionIds].sort());
  });

  it("mixes Multiple Choice and Typed Answer estimates correctly", () => {
    const decks: DeckPlanInput[] = [
      {
        deckId: "d1",
        deckTitle: "Mixed",
        questions: [makeQuestion("mc-1", "multiple_choice"), makeQuestion("typed-1", "typed_answer")],
      },
    ];
    const plan = computeGamePlan(decks, 6000);
    expect(plan.sections[0].questionIds).toEqual(["mc-1", "typed-1"]);
    expect(plan.sections[0].estimatedSeconds).toBe(
      QUESTION_SECONDS_ESTIMATE.multiple_choice + QUESTION_SECONDS_ESTIMATE.typed_answer,
    );
  });

  it("adds one section-transition allowance per Deck boundary to the total estimate", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "d1", deckTitle: "A", questions: makeQuestions(20, "a") },
      { deckId: "d2", deckTitle: "B", questions: makeQuestions(20, "b") },
      { deckId: "d3", deckTitle: "C", questions: makeQuestions(20, "c") },
    ];
    const plan = computeGamePlan(decks, 600);
    const questionSeconds = plan.sections.reduce((sum, s) => sum + s.estimatedSeconds, 0);
    expect(plan.estimatedDurationSeconds).toBe(questionSeconds + 2 * SECTION_TRANSITION_SECONDS_ESTIMATE);
  });
});

describe("computeGamePlan - under-filled Deck redistribution", () => {
  it("gives a short Deck's unused time to a Deck that had more content available", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "short", deckTitle: "Short", questions: makeQuestions(1, "s") },
      { deckId: "long", deckTitle: "Long", questions: makeQuestions(20, "l") },
    ];
    const plan = computeGamePlan(decks, 600);
    const short = plan.sections.find((s) => s.deckId === "short")!;
    const long = plan.sections.find((s) => s.deckId === "long")!;

    expect(short.questionIds).toEqual(["s-1"]);
    expect(short.estimatedSeconds).toBeLessThan(short.allocatedSeconds);
    // Long's enlarged budget should let it select more Questions than its bare equal share would.
    expect(long.allocatedSeconds).toBe(300);
    expect(long.estimatedSeconds).toBeGreaterThan(300);
  });

  it("includes all of a short Deck's Questions rather than truncating it further", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "short", deckTitle: "Short", questions: makeQuestions(2, "s") },
      { deckId: "long", deckTitle: "Long", questions: makeQuestions(20, "l") },
    ];
    const plan = computeGamePlan(decks, 1800);
    const short = plan.sections.find((s) => s.deckId === "short")!;
    expect(short.questionIds).toEqual(["s-1", "s-2"]);
  });
});

describe("computeGamePlan - truncation when a Deck exceeds its allocation", () => {
  it("selects only as many Questions as fit, preserving order", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Big", questions: makeQuestions(100, "q") }];
    const plan = computeGamePlan(decks, 60); // 60 seconds total, ~1.33 questions worth
    expect(plan.sections[0].questionIds.length).toBeLessThan(100);
    expect(plan.sections[0].questionIds[0]).toBe("q-1");
  });
});

describe("computeGamePlanWarnings", () => {
  it("warns when the minimum one-Question-per-Deck content exceeds the target", () => {
    const decks: DeckPlanInput[] = Array.from({ length: 5 }, (_, i) => ({
      deckId: `d${i}`,
      deckTitle: `Deck ${i}`,
      questions: makeQuestions(1, `d${i}`),
    }));
    const plan = computeGamePlan(decks, 180); // 180s target, but 5 Questions alone cost 5*45=225s
    const warnings = computeGamePlanWarnings(plan);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("minimum_exceeds_target");
    expect(warnings[0].message).toMatch(/increase the game time or remove a deck/i);
  });

  it("warns honestly when selected Decks don't contain enough content to fill the target", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Tiny", questions: makeQuestions(2, "q") }];
    const plan = computeGamePlan(decks, 1800);
    const warnings = computeGamePlanWarnings(plan);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("shortfall");
    expect(warnings[0].message).toContain("Your target is 30 minutes");
  });

  it("has no warnings when content comfortably matches the target", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Just Right", questions: makeQuestions(20, "q") }];
    const plan = computeGamePlan(decks, 20 * MC_SECONDS);
    expect(computeGamePlanWarnings(plan)).toEqual([]);
  });
});

describe("computePlanSummary", () => {
  it("matches computeGamePlan's own counts and estimate, without exposing Question ids", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") },
      { deckId: "d2", deckTitle: "Music", questions: makeQuestions(2, "s") },
    ];
    const plan = computeGamePlan(decks, 600);
    const summary = computePlanSummary(decks, 600);

    expect(summary.deckCount).toBe(plan.sections.length);
    expect(summary.questionCount).toBe(plan.questions.length);
    expect(summary.estimatedDurationSeconds).toBe(plan.estimatedDurationSeconds);
    expect(summary.sections).toEqual(
      plan.sections.map((section) => ({
        deckId: section.deckId,
        deckTitle: section.deckTitle,
        selectedQuestionCount: section.questionIds.length,
        allocatedSeconds: section.allocatedSeconds,
        estimatedSeconds: section.estimatedSeconds,
      })),
    );
    for (const section of summary.sections) {
      expect(section).not.toHaveProperty("questionIds");
    }
  });

  it("produces a zeroed-out summary for an empty Deck selection", () => {
    const summary = computePlanSummary([], 600);
    expect(summary).toEqual({ deckCount: 0, questionCount: 0, estimatedDurationSeconds: 0, sections: [] });
  });
});

describe("findSectionForQuestion", () => {
  it("finds the correct section and its 1-based position", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") },
      { deckId: "d2", deckTitle: "Music", questions: makeQuestions(3, "s") },
    ];
    const plan = computeGamePlan(decks, 600);
    const found = findSectionForQuestion(plan, "s-1");
    expect(found).not.toBeNull();
    expect(found?.section.deckId).toBe("d2");
    expect(found?.sectionNumber).toBe(2);
    expect(found?.totalSections).toBe(2);
  });

  it("returns null for an unrecognized Question id", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") }];
    const plan = computeGamePlan(decks, 600);
    expect(findSectionForQuestion(plan, "unknown")).toBeNull();
  });

  it("returns null for a null Question id", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") }];
    const plan = computeGamePlan(decks, 600);
    expect(findSectionForQuestion(plan, null)).toBeNull();
  });
});

describe("parseRoomDeckSnapshot", () => {
  it("parses a valid planned_game object", () => {
    const raw = {
      kind: "planned_game",
      version: 1,
      isQuickPlay: false,
      targetDurationSeconds: 1200,
      selectedDeckIds: ["a", "b"],
      planSummary: { deckCount: 2, questionCount: 5, estimatedDurationSeconds: 300, sections: [] },
      status: "setup",
      hostParticipation: "host_only",
    };
    expect(parseRoomDeckSnapshot(raw)).toEqual(raw);
  });

  it("defaults isQuickPlay/status/hostParticipation for a planned_game missing them (pre-restructure row)", () => {
    const raw = {
      kind: "planned_game",
      version: 1,
      targetDurationSeconds: 1200,
      selectedDeckIds: ["a", "b"],
      planSummary: { deckCount: 2, questionCount: 5, estimatedDurationSeconds: 300, sections: [] },
    };
    expect(parseRoomDeckSnapshot(raw)).toEqual({
      ...raw,
      isQuickPlay: false,
      status: "invite",
      hostParticipation: "host_only",
    });
  });

  it("parses a valid game_plan object", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") }];
    const plan = { ...computeGamePlan(decks, 600), hostParticipation: "playing_host" as const };
    expect(parseRoomDeckSnapshot(plan)).toEqual(plan);
  });

  it("defaults hostParticipation for a game_plan missing it (pre-restructure row)", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") }];
    const plan = computeGamePlan(decks, 600);
    expect(parseRoomDeckSnapshot(plan)).toEqual({ ...plan, hostParticipation: "host_only" });
  });

  it("returns null for null (Quick Play)", () => {
    expect(parseRoomDeckSnapshot(null)).toBeNull();
  });

  it("returns null for garbage/malformed data instead of crashing", () => {
    expect(parseRoomDeckSnapshot({ nonsense: true })).toBeNull();
    expect(parseRoomDeckSnapshot("a string")).toBeNull();
    expect(parseRoomDeckSnapshot(42)).toBeNull();
    expect(parseRoomDeckSnapshot(undefined)).toBeNull();
  });

  it("returns null for a game_plan with the wrong version", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") }];
    const plan = computeGamePlan(decks, 600);
    expect(parseRoomDeckSnapshot({ ...plan, version: 2 })).toBeNull();
  });

  it("returns null for a game_plan with an empty questions array", () => {
    expect(
      parseRoomDeckSnapshot({
        kind: "game_plan",
        version: 1,
        totalDurationSeconds: 600,
        estimatedDurationSeconds: 0,
        sections: [],
        questions: [],
      }),
    ).toBeNull();
  });

  it("returns null for a planned_game missing its planSummary", () => {
    expect(
      parseRoomDeckSnapshot({
        kind: "planned_game",
        version: 1,
        targetDurationSeconds: 1200,
        selectedDeckIds: ["a"],
      }),
    ).toBeNull();
  });

  it("returns null for a planned_game with a non-string selectedDeckIds entry", () => {
    expect(
      parseRoomDeckSnapshot({
        kind: "planned_game",
        version: 1,
        targetDurationSeconds: 1200,
        selectedDeckIds: ["a", 42],
        planSummary: { deckCount: 1, questionCount: 1, estimatedDurationSeconds: 60, sections: [] },
      }),
    ).toBeNull();
  });

  it("returns null for a planned_game with the wrong version", () => {
    expect(
      parseRoomDeckSnapshot({
        kind: "planned_game",
        version: 2,
        targetDurationSeconds: 1200,
        selectedDeckIds: [],
        planSummary: { deckCount: 0, questionCount: 0, estimatedDurationSeconds: 0, sections: [] },
      }),
    ).toBeNull();
  });
});

describe("deriveLobbyStage", () => {
  function planAtStatus(status: "invite" | "setup"): PlannedGame {
    return {
      kind: "planned_game",
      version: 1,
      isQuickPlay: false,
      targetDurationSeconds: 1200,
      selectedDeckIds: ["a"],
      planSummary: { deckCount: 1, questionCount: 3, estimatedDurationSeconds: 200, sections: [] },
      status,
      hostParticipation: "host_only",
    };
  }

  it("returns 'invite' for a legacy null snapshot", () => {
    expect(deriveLobbyStage(null)).toBe("invite");
  });

  it("returns the planned_game's own status for each of invite/setup", () => {
    expect(deriveLobbyStage(planAtStatus("invite"))).toBe("invite");
    expect(deriveLobbyStage(planAtStatus("setup"))).toBe("setup");
  });

  it("always returns 'setup' for a frozen game_plan (a rematch Lobby skips Invite and is always locked)", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") }];
    const plan = { ...computeGamePlan(decks, 600), hostParticipation: "host_only" as const };
    expect(deriveLobbyStage(plan)).toBe("setup");
  });
});
