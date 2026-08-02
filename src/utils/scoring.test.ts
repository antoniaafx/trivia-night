import { describe, expect, it } from "vitest";
import {
  computeAggregateReveal,
  computeWinners,
  gradeSubmission,
  isEventForCurrentInstance,
  isEventForCurrentQuestion,
  normalizeTeamName,
  pointsForGrade,
  sortLeaderboard,
  sumPointsAwarded,
  validateTeamName,
} from "./scoring";
import { playerToCompetitor, teamToCompetitor } from "../types/game";
import type { PlayerRecord, TeamRecord } from "../types/game";
import type { MultipleChoiceQuestion, TypedAnswerQuestion } from "../data/questions";

const mcQuestion: MultipleChoiceQuestion = {
  id: "q1",
  answerMethod: "multiple_choice",
  prompt: "What is the capital of France?",
  options: [
    { id: "a", text: "Paris" },
    { id: "b", text: "London" },
    { id: "c", text: "Berlin" },
    { id: "d", text: "Madrid" },
  ],
  correctOptionId: "a",
  points: 100,
};

const typedQuestion: TypedAnswerQuestion = {
  id: "q2",
  answerMethod: "typed_answer",
  prompt: "Who wrote Romeo and Juliet?",
  points: 100,
  correctAnswer: "William Shakespeare",
  acceptedAnswers: ["Shakespeare", "W Shakespeare", "W. Shakespeare"],
};

function makePlayer(overrides: Partial<PlayerRecord>): PlayerRecord {
  return {
    roomCode: "ABCD",
    clientId: "client-1",
    displayName: "Player",
    isHost: false,
    joinedAt: "2026-01-01T00:00:00.000Z",
    score: 0,
    teamId: null,
    ...overrides,
  };
}

function makeTeam(overrides: Partial<TeamRecord>): TeamRecord {
  return {
    id: "team-1",
    roomCode: "ABCD",
    name: "Team",
    createdAt: "2026-01-01T00:00:00.000Z",
    score: 0,
    ...overrides,
  };
}

describe("gradeSubmission", () => {
  it("grades a correct Multiple Choice option as correct", () => {
    expect(gradeSubmission(mcQuestion, { optionId: "a", textAnswer: null })).toBe("correct");
  });

  it("grades any other Multiple Choice option as incorrect", () => {
    expect(gradeSubmission(mcQuestion, { optionId: "b", textAnswer: null })).toBe("incorrect");
  });

  it("grades an unanswered Multiple Choice question as incorrect", () => {
    expect(gradeSubmission(mcQuestion, { optionId: null, textAnswer: null })).toBe("incorrect");
  });

  it("grades an exact Typed Answer match as correct", () => {
    expect(gradeSubmission(typedQuestion, { optionId: null, textAnswer: "William Shakespeare" })).toBe("correct");
  });

  it("grades an accepted Typed Answer variant as correct", () => {
    expect(gradeSubmission(typedQuestion, { optionId: null, textAnswer: "Shakespeare" })).toBe("correct");
  });

  it("grades a possible typo as pending_review", () => {
    expect(gradeSubmission(typedQuestion, { optionId: null, textAnswer: "Shakespear" })).toBe("pending_review");
  });

  it("grades a clear mismatch as incorrect", () => {
    expect(gradeSubmission(typedQuestion, { optionId: null, textAnswer: "Christopher Marlowe" })).toBe("incorrect");
  });

  it("grades an unanswered Typed Answer question as incorrect", () => {
    expect(gradeSubmission(typedQuestion, { optionId: null, textAnswer: null })).toBe("incorrect");
  });
});

describe("pointsForGrade", () => {
  it("awards full points only for correct", () => {
    expect(pointsForGrade("correct", mcQuestion)).toBe(100);
  });

  it("awards zero for incorrect", () => {
    expect(pointsForGrade("incorrect", mcQuestion)).toBe(0);
  });

  it("awards zero for pending_review - provisional until a Host resolves it", () => {
    expect(pointsForGrade("pending_review", typedQuestion)).toBe(0);
  });

  it("awards zero for ungraded", () => {
    expect(pointsForGrade("ungraded", mcQuestion)).toBe(0);
  });
});

describe("sumPointsAwarded", () => {
  it("sums points across every answer row", () => {
    expect(sumPointsAwarded([{ pointsAwarded: 100 }, { pointsAwarded: 0 }, { pointsAwarded: 100 }])).toBe(200);
  });

  it("returns 0 for no answers", () => {
    expect(sumPointsAwarded([])).toBe(0);
  });

  it("is idempotent - recomputing from the same rows never changes the result", () => {
    const rows = [{ pointsAwarded: 100 }, { pointsAwarded: 0 }];
    const first = sumPointsAwarded(rows);
    const second = sumPointsAwarded(rows);
    const third = sumPointsAwarded(rows);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("reflects a review decision flip without double-counting (Accept -> Reject)", () => {
    const afterAccept = [{ pointsAwarded: 100 }, { pointsAwarded: 0 }];
    expect(sumPointsAwarded(afterAccept)).toBe(100);

    // The Host changes their mind: the same row's points_awarded is
    // overwritten (never incremented), so recomputing reflects exactly
    // one row's worth of change, not a stacked double-award.
    const afterReject = [{ pointsAwarded: 0 }, { pointsAwarded: 0 }];
    expect(sumPointsAwarded(afterReject)).toBe(0);
  });

  it("repeated Accept clicks on an already-correct row cannot duplicate points", () => {
    const rowAfterOneAccept = [{ pointsAwarded: 100 }];
    const rowAfterTwoAccepts = [{ pointsAwarded: 100 }]; // Accept always overwrites to the same value, never adds
    expect(sumPointsAwarded(rowAfterOneAccept)).toBe(sumPointsAwarded(rowAfterTwoAccepts));
  });
});

describe("computeAggregateReveal", () => {
  it("reports zero-answer state without dividing by zero", () => {
    expect(computeAggregateReveal([])).toEqual({
      answeredCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      pendingCount: 0,
      percentageCorrect: 0,
    });
  });

  it("counts correct/incorrect and rounds the resolved percentage", () => {
    const answers = [
      { gradingStatus: "correct" as const },
      { gradingStatus: "correct" as const },
      { gradingStatus: "incorrect" as const },
    ];
    expect(computeAggregateReveal(answers)).toEqual({
      answeredCount: 3,
      correctCount: 2,
      incorrectCount: 1,
      pendingCount: 0,
      percentageCorrect: 67,
    });
  });

  it("excludes pending_review answers from the percentage denominator without dropping their count", () => {
    const answers = [
      { gradingStatus: "correct" as const },
      { gradingStatus: "pending_review" as const },
      { gradingStatus: "pending_review" as const },
    ];
    expect(computeAggregateReveal(answers)).toEqual({
      answeredCount: 3,
      correctCount: 1,
      incorrectCount: 0,
      pendingCount: 2,
      percentageCorrect: 100, // 1 of 1 *resolved* answers - the 2 pending are shown separately, not folded in
    });
  });

  it("reports 0% when every answer is still pending review", () => {
    const answers = [{ gradingStatus: "pending_review" as const }, { gradingStatus: "pending_review" as const }];
    expect(computeAggregateReveal(answers)).toEqual({
      answeredCount: 2,
      correctCount: 0,
      incorrectCount: 0,
      pendingCount: 2,
      percentageCorrect: 0,
    });
  });
});

describe("sortLeaderboard", () => {
  it("ranks by score descending", () => {
    const competitors = [
      playerToCompetitor(makePlayer({ clientId: "low", score: 10, joinedAt: "2026-01-01T00:00:00.000Z" })),
      playerToCompetitor(makePlayer({ clientId: "high", score: 100, joinedAt: "2026-01-01T00:00:00.000Z" })),
    ];
    expect(sortLeaderboard(competitors).map((c) => c.id)).toEqual(["high", "low"]);
  });

  it("breaks a score tie by earliest tiebreakAt", () => {
    const competitors = [
      playerToCompetitor(makePlayer({ clientId: "later", score: 50, joinedAt: "2026-01-01T00:00:10.000Z" })),
      playerToCompetitor(makePlayer({ clientId: "earlier", score: 50, joinedAt: "2026-01-01T00:00:00.000Z" })),
    ];
    expect(sortLeaderboard(competitors).map((c) => c.id)).toEqual(["earlier", "later"]);
  });

  it("breaks a fully tied score and tiebreakAt by id, deterministically", () => {
    const same = "2026-01-01T00:00:00.000Z";
    const competitors = [
      playerToCompetitor(makePlayer({ clientId: "b-client", score: 50, joinedAt: same })),
      playerToCompetitor(makePlayer({ clientId: "a-client", score: 50, joinedAt: same })),
    ];
    expect(sortLeaderboard(competitors).map((c) => c.id)).toEqual(["a-client", "b-client"]);
  });

  it("ranks teams the same way as players via the shared Competitor shape", () => {
    const competitors = [
      teamToCompetitor(makeTeam({ id: "team-low", score: 0 })),
      teamToCompetitor(makeTeam({ id: "team-high", score: 200 })),
    ];
    expect(sortLeaderboard(competitors).map((c) => c.id)).toEqual(["team-high", "team-low"]);
  });

  it("ranks a competitor's two-question accumulated score correctly against a single-question score", () => {
    // e.g. a player who got Q1 wrong (0) but Q2 right (100) should still
    // beat a player who only got Q1 right (100) but Q2 wrong (0) when tied -
    // this just exercises that sortLeaderboard only ever looks at the
    // final accumulated `score`, never per-question detail.
    const competitors = [
      playerToCompetitor(makePlayer({ clientId: "a", score: 100 })),
      playerToCompetitor(makePlayer({ clientId: "b", score: 200 })),
    ];
    expect(sortLeaderboard(competitors).map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("computeWinners", () => {
  it("returns an empty list for no competitors", () => {
    expect(computeWinners([])).toEqual([]);
  });

  it("returns the single highest scorer", () => {
    const competitors = [
      playerToCompetitor(makePlayer({ clientId: "a", score: 100 })),
      playerToCompetitor(makePlayer({ clientId: "b", score: 50 })),
    ];
    expect(computeWinners(competitors).map((c) => c.id)).toEqual(["a"]);
  });

  it("returns every competitor tied for the highest score", () => {
    const competitors = [
      playerToCompetitor(makePlayer({ clientId: "a", score: 100 })),
      playerToCompetitor(makePlayer({ clientId: "b", score: 100 })),
      playerToCompetitor(makePlayer({ clientId: "c", score: 50 })),
    ];
    expect(computeWinners(competitors).map((c) => c.id).sort()).toEqual(["a", "b"]);
  });
});

describe("normalizeTeamName / validateTeamName", () => {
  it("normalizes by trimming and lowercasing", () => {
    expect(normalizeTeamName("  Quiz Wizards  ")).toBe("quiz wizards");
  });

  it("treats names differing only by case/whitespace as the same normalized name", () => {
    expect(normalizeTeamName("Quiz Wizards")).toBe(normalizeTeamName(" quiz wizards "));
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(validateTeamName("")).toEqual({ valid: false, reason: "Enter a team name." });
    expect(validateTeamName("   ")).toEqual({ valid: false, reason: "Enter a team name." });
  });

  it("rejects a name over the max length", () => {
    const tooLong = "a".repeat(31);
    const result = validateTeamName(tooLong);
    expect(result.valid).toBe(false);
  });

  it("accepts a reasonable name", () => {
    expect(validateTeamName("Quiz Wizards")).toEqual({ valid: true });
  });
});

describe("isEventForCurrentInstance", () => {
  it("accepts an event matching the current instance", () => {
    expect(isEventForCurrentInstance("instance-1", "instance-1")).toBe(true);
  });

  it("rejects an event from a superseded instance", () => {
    expect(isEventForCurrentInstance("instance-old", "instance-new")).toBe(false);
  });

  it("rejects any event when there is no current instance yet", () => {
    expect(isEventForCurrentInstance("instance-1", null)).toBe(false);
  });
});

describe("isEventForCurrentQuestion", () => {
  it("accepts an event matching the current question", () => {
    expect(isEventForCurrentQuestion("q2", "q2")).toBe(true);
  });

  it("rejects an event for a question the room has moved on from", () => {
    expect(isEventForCurrentQuestion("q1", "q2")).toBe(false);
  });

  it("rejects any event when there is no current question (lobby)", () => {
    expect(isEventForCurrentQuestion("q1", null)).toBe(false);
  });
});
