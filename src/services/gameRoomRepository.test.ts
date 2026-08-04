import { describe, expect, it } from "vitest";
import { mapRealtimeRoomRow } from "./gameRoomRepository";
import type { GamePlan } from "../utils/gamePlan";
import type { RoomRecord } from "../types/game";

/**
 * Regression coverage for the production blank-screen-on-Reveal bug:
 * a large `deck_snapshot` can be TOASTed, and an UPDATE that doesn't
 * touch it (Reveal only changes `phase`) can arrive over Realtime with
 * the `deck_snapshot` key entirely missing from the payload - not set
 * to null, just absent. mapRealtimeRoomRow is the function responsible
 * for telling that apart from a genuine null and never wiping out a
 * room's live Game Plan because of it. See migration 0008 for the other
 * (DB-level) half of this fix.
 */

const samplePlan: GamePlan = {
  kind: "game_plan",
  version: 1,
  sections: [{ deckId: "d1", deckTitle: "General Knowledge Showcase", questionIds: ["q1", "q2"] }],
  questions: [
    {
      id: "q1",
      answerMethod: "multiple_choice",
      prompt: "How many continents are there on Earth?",
      points: 100,
      options: [
        { id: "A", text: "5" },
        { id: "B", text: "6" },
        { id: "C", text: "7" },
        { id: "D", text: "8" },
      ],
      correctOptionId: "C",
    },
    {
      id: "q2",
      answerMethod: "typed_answer",
      prompt: "What is the largest planet in our solar system?",
      points: 100,
      correctAnswer: "Jupiter",
      acceptedAnswers: [],
    },
  ],
  hostParticipation: "host_only",
  questionTimerSeconds: 30,
  questionFlow: "host_controlled",
};

const previousRoom: RoomRecord = {
  roomCode: "C3AVM",
  phase: "question",
  competitionStyle: "team",
  currentQuestionId: "q1",
  gameInstanceId: "instance-1",
  winnerIds: [],
  deckSnapshot: samplePlan,
  timerStatus: "running",
  timerStartedAt: "2026-08-04T09:00:00.000Z",
  timerRemainingSeconds: 30,
  createdAt: "2026-08-04T09:00:00.000Z",
  updatedAt: "2026-08-04T09:00:00.000Z",
};

function baseRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    room_code: "C3AVM",
    phase: "reveal",
    competition_style: "team",
    current_question_id: "q1",
    game_instance_id: "instance-1",
    winner_ids: [],
    created_at: "2026-08-04T09:00:05.000Z",
    updated_at: "2026-08-04T09:00:05.000Z",
    ...overrides,
  };
}

describe("mapRealtimeRoomRow", () => {
  it("reproduces the fix: a row missing the deck_snapshot key keeps the previous snapshot instead of wiping it out", () => {
    const row = baseRow(); // deliberately no `deck_snapshot` key at all - the exact TOAST-omission shape
    const updated = mapRealtimeRoomRow(row, previousRoom);

    expect(updated.deckSnapshot).toBe(samplePlan);
    expect(updated.phase).toBe("reveal");
  });

  it("applies a present deck_snapshot value normally", () => {
    const newPlan: GamePlan = { ...samplePlan, questionTimerSeconds: 60 };
    const row = baseRow({ deck_snapshot: newPlan });
    const updated = mapRealtimeRoomRow(row, previousRoom);

    expect(updated.deckSnapshot).toEqual(newPlan);
  });

  it("trusts an explicit null deck_snapshot (legacy Quick Play sentinel) rather than falling back", () => {
    const row = baseRow({ deck_snapshot: null });
    const updated = mapRealtimeRoomRow(row, previousRoom);

    expect(updated.deckSnapshot).toBeNull();
  });

  it("falls back to null (not a crash) when there is no previous room to fall back to", () => {
    const row = baseRow();
    const updated = mapRealtimeRoomRow(row, null);

    expect(updated.deckSnapshot).toBeNull();
  });

  it("maps every other field from the row regardless of deck_snapshot presence", () => {
    const row = baseRow({ winner_ids: ["team-1"] });
    const updated = mapRealtimeRoomRow(row, previousRoom);

    expect(updated).toMatchObject({
      roomCode: "C3AVM",
      phase: "reveal",
      competitionStyle: "team",
      currentQuestionId: "q1",
      gameInstanceId: "instance-1",
      winnerIds: ["team-1"],
    });
  });
});
