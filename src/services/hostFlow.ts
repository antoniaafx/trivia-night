import { generateRoomCode } from "./roomCode";
import { ensureRoomExists, setRoomDeckSnapshot } from "./gameRoomRepository";
import { fetchDeck, fetchDeckQuestions } from "./deckRepository";
import { computePlanSummary } from "../utils/gamePlan";
import { isQuestionComplete } from "../utils/deckValidation";
import { GAME_DURATION_MINUTES_DEFAULT } from "../config/timingEstimates";
import type { HostParticipation, LobbyStatus, PlannedGame, DeckPlanInput } from "../utils/gamePlan";

interface BuildPlannedGameOptions {
  isQuickPlay?: boolean;
  status?: LobbyStatus;
  hostParticipation?: HostParticipation;
}

/**
 * Builds the `planned_game` snapshot for a given Deck selection/duration
 * - shared by room creation (below) and live setup edits made from
 * inside the Host Lobby (see useGameRoom's updateRoomSetup/setHostParticipation),
 * so every path computes the same summary the same way and can never
 * drift. An empty selection is valid (a fresh Custom Game with no Deck
 * chosen yet) and produces a zeroed-out summary rather than an error.
 *
 * `options` defaults describe a brand-new room's starting point (not
 * Quick Play, Invite stage, dedicated Host); a caller preserving an
 * existing room's setup (e.g. after the Host edits just the duration)
 * must pass its current `isQuickPlay`/`status`/`hostParticipation`
 * through explicitly, or this would silently reset them.
 */
export async function buildPlannedGame(
  selectedDeckIds: string[],
  targetDurationSeconds: number,
  options: BuildPlannedGameOptions = {},
): Promise<PlannedGame> {
  const isQuickPlay = options.isQuickPlay ?? false;
  const status = options.status ?? "invite";
  const hostParticipation = options.hostParticipation ?? "host_only";

  if (selectedDeckIds.length === 0) {
    return {
      kind: "planned_game",
      version: 1,
      isQuickPlay,
      targetDurationSeconds,
      selectedDeckIds: [],
      planSummary: { deckCount: 0, questionCount: 0, estimatedDurationSeconds: 0, sections: [] },
      status,
      hostParticipation,
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
    isQuickPlay,
    targetDurationSeconds,
    selectedDeckIds,
    planSummary: computePlanSummary(deckInputs, targetDurationSeconds),
    status,
    hostParticipation,
  };
}

/**
 * Quick Play's room: created immediately, just like a Custom Game room,
 * and now moves through the same Invite / Setup / Ready stages - Quick
 * Play never has Decks to pick (the `isQuickPlay: true` flag is what
 * hides the Deck picker in Game Setup), but its competition style and
 * Host Participation still follow the same lock-at-Confirm-Setup timing
 * as any other room, so it still needs a real `planned_game` object
 * from the moment it's created rather than staying `null` forever.
 */
export async function createQuickPlayRoom(): Promise<string> {
  const roomCode = generateRoomCode();
  await ensureRoomExists(roomCode);

  const planned = await buildPlannedGame([], GAME_DURATION_MINUTES_DEFAULT * 60, {
    isQuickPlay: true,
    status: "invite",
  });
  await setRoomDeckSnapshot(roomCode, planned);
  return roomCode;
}

/**
 * Every Custom Game entry point creates a room this way: "Host" from
 * My Decks, "Host This Deck" from the Deck Editor, and a fresh Custom
 * Game with no Deck chosen yet all funnel through here. The room
 * exists immediately - Players can join and the QR/room code are live
 * - before any Deck has necessarily been chosen. `deck_snapshot` starts
 * as a `kind: "planned_game"` object at Invite stage that the Host
 * keeps editing live once they reach Game Setup (see useGameRoom's
 * updateRoomSetup/confirmSetup); Start Game later replaces it with the
 * frozen `kind: "game_plan"`.
 */
export async function createHostedRoom(preselectedDeckIds: string[] = []): Promise<string> {
  const roomCode = generateRoomCode();
  await ensureRoomExists(roomCode);

  const targetDurationSeconds = GAME_DURATION_MINUTES_DEFAULT * 60;
  const planned = await buildPlannedGame(preselectedDeckIds, targetDurationSeconds, {
    isQuickPlay: false,
    status: "invite",
  });
  await setRoomDeckSnapshot(roomCode, planned);
  return roomCode;
}
