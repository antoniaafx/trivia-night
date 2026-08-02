import { describe, expect, it } from "vitest";
import {
  computeAggregateReveal,
  computeWinners,
  isAnswerCorrect,
  isEventForCurrentInstance,
  normalizeTeamName,
  scoreForAnswer,
  sortLeaderboard,
  validateTeamName,
} from "./scoring";
import { playerToCompetitor, teamToCompetitor } from "../types/game";
import type { PlayerRecord, TeamRecord } from "../types/game";
import type { Question } from "../data/questions";

const question: Question = {
  id: "q1",
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

describe("isAnswerCorrect / scoreForAnswer", () => {
  it("treats the correct option id as correct", () => {
    expect(isAnswerCorrect("a", question)).toBe(true);
    expect(scoreForAnswer("a", question)).toBe(100);
  });

  it("treats any other option id as incorrect", () => {
    expect(isAnswerCorrect("b", question)).toBe(false);
    expect(scoreForAnswer("b", question)).toBe(0);
  });

  it("treats an unanswered (undefined) option as incorrect", () => {
    expect(isAnswerCorrect(undefined, question)).toBe(false);
    expect(scoreForAnswer(undefined, question)).toBe(0);
  });
});

describe("computeAggregateReveal", () => {
  it("reports zero-answer state without dividing by zero", () => {
    expect(computeAggregateReveal([], question)).toEqual({
      answeredCount: 0,
      correctCount: 0,
      percentageCorrect: 0,
    });
  });

  it("counts correct answers and rounds the percentage", () => {
    const answers = [{ optionId: "a" }, { optionId: "a" }, { optionId: "b" }];
    expect(computeAggregateReveal(answers, question)).toEqual({
      answeredCount: 3,
      correctCount: 2,
      percentageCorrect: 67,
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
