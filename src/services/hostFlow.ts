import { generateRoomCode } from "./roomCode";
import { ensureRoomExists, setRoomDeckSnapshot } from "./gameRoomRepository";
import { fetchDeck, fetchDeckQuestions } from "./deckRepository";
import { computePlanSummary } from "../utils/gamePlan";
import { isQuestionComplete } from "../utils/deckValidation";
import { GAME_DURATION_MINUTES_DEFAULT } from "../config/timingEstimates";
import type { PlannedGame, DeckPlanInput } from "../utils/gamePlan";

/**
 * Quick Play's room: created immediately, deck_snapshot deliberately
 * left untouched (SQL NULL) - the sentinel useGameRoom already reads as
 * "use the built-in sample content." No setup panel is shown for this
 * room; Quick Play is a complete, fixed choice, not a starting point
 * for picking Decks later (see the Milestone 5 report for why).
 */
export async function createQuickPlayRoom(): Promise<string> {
  const roomCode = generateRoomCode();
  await ensureRoomExists(roomCode);
  return roomCode;
}

/**
 * Builds the `planned_game` snapshot for a given Deck selection/duration
 * - shared by room creation (below) and live setup edits made from
 * inside the Host Lobby (see useGameRoom's updateRoomSetup), so both
 * paths compute the same summary the same way and can never drift.
 * An empty selection is valid (a fresh Custom Game with no Deck chosen
 * yet) and produces a zeroed-out summary rather than an error.
 */
export async function buildPlannedGame(
  selectedDeckIds: string[],
  targetDurationSeconds: number,
): Promise<PlannedGame> {
  if (selectedDeckIds.length === 0) {
    return {
      kind: "planned_game",
      version: 1,
      targetDurationSeconds,
      selectedDeckIds: [],
      planSummary: { deckCount: 0, questionCount: 0, estimatedDurationSeconds: 0, sections: [] },
    };
  }

  const deckInputs: DeckPlanInput[] = await Promise.all(
    selectedDeckIds.map(async (deckId) => {
      const deck = await fetchDeck(deckId);
      const questions = (await fetchDeckQuestions(deckId)).filter(isQuestionComplete);
      return { deckId, deckTitle: deck?.title ?? "Untitled Trivia", questions };
    }),
  );

  return {
    kind: "planned_game",
    version: 1,
    targetDurationSeconds,
    selectedDeckIds,
    planSummary: computePlanSummary(deckInputs, targetDurationSeconds),
  };
}

/**
 * Every Custom Game entry point creates a room this way: "Host" from
 * My Decks, "Host This Deck" from the Deck Editor, and a fresh Custom
 * Game with no Deck chosen yet all funnel through here. The room
 * exists immediately - Players can join and the QR/room code are live
 * - before any Deck has necessarily been chosen. `deck_snapshot` starts
 * as a `kind: "planned_game"` object the Host keeps editing live in the
 * Lobby (see useGameRoom's updateRoomSetup); Start Game later replaces
 * it with the frozen `kind: "game_plan"`.
 */
export async function createHostedRoom(preselectedDeckIds: string[] = []): Promise<string> {
  const roomCode = generateRoomCode();
  await ensureRoomExists(roomCode);

  const targetDurationSeconds = GAME_DURATION_MINUTES_DEFAULT * 60;
  const planned = await buildPlannedGame(preselectedDeckIds, targetDurationSeconds);
  await setRoomDeckSnapshot(roomCode, planned);
  return roomCode;
}
