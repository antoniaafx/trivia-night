import { describe, expect, it } from "vitest";
import {
  computeGamePlan,
  computePlanSummary,
  deriveLobbyStage,
  findSectionForQuestion,
  parseRoomDeckSnapshot,
  validateDeckSelection,
} from "./gamePlan";
import type { DeckPlanInput, PlannedGame } from "./gamePlan";
import { MAX_DECKS_PER_GAME } from "../config/timingEstimates";
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

describe("computeGamePlan", () => {
  it("plays every Question from a single Deck, in order", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Movies", questions: makeQuestions(20, "q") }];
    const plan = computeGamePlan(decks);
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0].questionIds).toEqual(makeQuestions(20, "q").map((q) => q.id));
    expect(plan.questions).toHaveLength(20);
  });

  it("concatenates every selected Deck's Questions, in the Host's chosen Deck order", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "d1", deckTitle: "Movies", questions: makeQuestions(20, "m") },
      { deckId: "d2", deckTitle: "Music", questions: makeQuestions(15, "s") },
    ];
    const plan = computeGamePlan(decks);
    expect(plan.sections.map((s) => s.deckId)).toEqual(["d1", "d2"]);
    expect(plan.questions).toHaveLength(35);
    expect(plan.questions[0].id).toBe("m-1");
    expect(plan.questions[19].id).toBe("m-20");
    expect(plan.questions[20].id).toBe("s-1");
  });

  it("is deterministic - identical inputs always produce an identical plan", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "d1", deckTitle: "Movies", questions: makeQuestions(7, "m") },
      { deckId: "d2", deckTitle: "Music", questions: makeQuestions(5, "s", "typed_answer") },
    ];
    const first = computeGamePlan(decks);
    const second = computeGamePlan(decks);
    expect(first).toEqual(second);
  });

  it("preserves selected-Deck order and each Deck's own saved Question order - never truncates, skips, or reorders", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "d2", deckTitle: "Music", questions: makeQuestions(20, "s") },
      { deckId: "d1", deckTitle: "Movies", questions: makeQuestions(20, "m") },
    ];
    const plan = computeGamePlan(decks);
    expect(plan.sections.map((s) => s.deckId)).toEqual(["d2", "d1"]);
    expect(plan.sections[0].questionIds).toEqual(makeQuestions(20, "s").map((q) => q.id));
    expect(plan.questions).toHaveLength(40);
  });

  it("mixes Multiple Choice and Typed Answer Questions correctly", () => {
    const decks: DeckPlanInput[] = [
      {
        deckId: "d1",
        deckTitle: "Mixed",
        questions: [makeQuestion("mc-1", "multiple_choice"), makeQuestion("typed-1", "typed_answer")],
      },
    ];
    const plan = computeGamePlan(decks);
    expect(plan.sections[0].questionIds).toEqual(["mc-1", "typed-1"]);
    expect(plan.questions.map((q) => q.answerMethod)).toEqual(["multiple_choice", "typed_answer"]);
  });

  it("contributes an empty section for a Deck with no Questions, rather than skipping it", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "empty", deckTitle: "Empty", questions: [] },
      { deckId: "full", deckTitle: "Full", questions: makeQuestions(3, "f") },
    ];
    const plan = computeGamePlan(decks);
    expect(plan.sections.map((s) => s.deckId)).toEqual(["empty", "full"]);
    expect(plan.sections[0].questionIds).toEqual([]);
    expect(plan.questions).toHaveLength(3);
  });
});

describe("computePlanSummary", () => {
  it("matches computeGamePlan's own counts, without exposing Question ids", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") },
      { deckId: "d2", deckTitle: "Music", questions: makeQuestions(2, "s") },
    ];
    const plan = computeGamePlan(decks);
    const summary = computePlanSummary(decks);

    expect(summary.deckCount).toBe(plan.sections.length);
    expect(summary.questionCount).toBe(plan.questions.length);
    expect(summary.sections).toEqual(
      plan.sections.map((section) => ({
        deckId: section.deckId,
        deckTitle: section.deckTitle,
        selectedQuestionCount: section.questionIds.length,
      })),
    );
    for (const section of summary.sections) {
      expect(section).not.toHaveProperty("questionIds");
    }
  });

  it("produces a zeroed-out summary for an empty Deck selection", () => {
    const summary = computePlanSummary([]);
    expect(summary).toEqual({ deckCount: 0, questionCount: 0, sections: [] });
  });
});

describe("findSectionForQuestion", () => {
  it("finds the correct section and its 1-based position", () => {
    const decks: DeckPlanInput[] = [
      { deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") },
      { deckId: "d2", deckTitle: "Music", questions: makeQuestions(3, "s") },
    ];
    const plan = computeGamePlan(decks);
    const found = findSectionForQuestion(plan, "s-1");
    expect(found).not.toBeNull();
    expect(found?.section.deckId).toBe("d2");
    expect(found?.sectionNumber).toBe(2);
    expect(found?.totalSections).toBe(2);
  });

  it("returns null for an unrecognized Question id", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") }];
    const plan = computeGamePlan(decks);
    expect(findSectionForQuestion(plan, "unknown")).toBeNull();
  });

  it("returns null for a null Question id", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") }];
    const plan = computeGamePlan(decks);
    expect(findSectionForQuestion(plan, null)).toBeNull();
  });
});

describe("parseRoomDeckSnapshot", () => {
  it("parses a valid planned_game object", () => {
    const raw = {
      kind: "planned_game",
      version: 1,
      isQuickPlay: false,
      selectedDeckIds: ["a", "b"],
      planSummary: { deckCount: 2, questionCount: 5, sections: [] },
      status: "setup",
      hostParticipation: "host_only",
      questionTimerSeconds: 30,
      questionFlow: "host_controlled",
    };
    expect(parseRoomDeckSnapshot(raw)).toEqual(raw);
  });

  it("defaults isQuickPlay/status/hostParticipation/questionTimerSeconds/questionFlow for a planned_game missing them (pre-restructure row)", () => {
    const raw = {
      kind: "planned_game",
      version: 1,
      selectedDeckIds: ["a", "b"],
      planSummary: { deckCount: 2, questionCount: 5, sections: [] },
    };
    expect(parseRoomDeckSnapshot(raw)).toEqual({
      ...raw,
      isQuickPlay: false,
      status: "invite",
      hostParticipation: "host_only",
      questionTimerSeconds: 30,
      questionFlow: "host_controlled",
    });
  });

  it("trusts an explicit null questionTimerSeconds (No Timer) rather than defaulting it", () => {
    const raw = {
      kind: "planned_game",
      version: 1,
      selectedDeckIds: [],
      planSummary: { deckCount: 0, questionCount: 0, sections: [] },
      questionTimerSeconds: null,
    };
    expect(parseRoomDeckSnapshot(raw)?.questionTimerSeconds).toBeNull();
  });

  it("parses a valid game_plan object", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") }];
    const plan = {
      ...computeGamePlan(decks),
      hostParticipation: "playing_host" as const,
      questionTimerSeconds: 45,
      questionFlow: "automatic" as const,
    };
    expect(parseRoomDeckSnapshot(plan)).toEqual(plan);
  });

  it("defaults hostParticipation/questionTimerSeconds/questionFlow for a game_plan missing them (pre-restructure row)", () => {
    const decks: DeckPlanInput[] = [{ deckId: "d1", deckTitle: "Movies", questions: makeQuestions(3, "m") }];
    const plan = computeGamePlan(decks);
    expect(parseRoomDeckSnapshot(plan)).toEqual({
      ...plan,
      hostParticipation: "host_only",
      questionTimerSeconds: 30,
      questionFlow: "host_controlled",
    });
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
    const plan = computeGamePlan(decks);
    expect(parseRoomDeckSnapshot({ ...plan, version: 2 })).toBeNull();
  });

  it("returns null for a game_plan with an empty questions array", () => {
    expect(
      parseRoomDeckSnapshot({
        kind: "game_plan",
        version: 1,
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
        selectedDeckIds: ["a"],
      }),
    ).toBeNull();
  });

  it("returns null for a planned_game with a non-string selectedDeckIds entry", () => {
    expect(
      parseRoomDeckSnapshot({
        kind: "planned_game",
        version: 1,
        selectedDeckIds: ["a", 42],
        planSummary: { deckCount: 1, questionCount: 1, sections: [] },
      }),
    ).toBeNull();
  });

  it("returns null for a planned_game with the wrong version", () => {
    expect(
      parseRoomDeckSnapshot({
        kind: "planned_game",
        version: 2,
        selectedDeckIds: [],
        planSummary: { deckCount: 0, questionCount: 0, sections: [] },
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
      selectedDeckIds: ["a"],
      planSummary: { deckCount: 1, questionCount: 3, sections: [] },
      status,
      hostParticipation: "host_only",
      questionTimerSeconds: 30,
      questionFlow: "host_controlled",
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
    const plan = {
      ...computeGamePlan(decks),
      hostParticipation: "host_only" as const,
      questionTimerSeconds: 30,
      questionFlow: "host_controlled" as const,
    };
    expect(deriveLobbyStage(plan)).toBe("setup");
  });
});
