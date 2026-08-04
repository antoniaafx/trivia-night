import { generateRoomCode } from "./roomCode";
import { ensureRoomExists, setRoomDeckSnapshot } from "./gameRoomRepository";
import { fetchDeck, fetchDeckQuestions } from "./deckRepository";
import { computePlanSummary } from "../utils/gamePlan";
import { isQuestionComplete } from "../utils/deckValidation";
import { GAME_DURATION_MINUTES_DEFAULT } from "../config/timingEstimates";
import type { HostParticipation, LobbyStatus, PlannedGame, DeckPlanInput } from "../utils/gamePlan";

interface BuildPlannedGameOptions {
  status?: LobbyStatus;
  hostParticipation?: HostParticipation;
}

/**
 * Builds the `planned_game` snapshot for a given Deck selection/duration
 * - shared by room creation (below) and live setup edits made from
 * inside the Host Lobby (see useGameRoom's updateRoomSetup/setHostParticipation),
 * so every path computes the same summary the same way and can never
 * drift. Quick Play isn't a separate choice the caller makes - it's
 * just what an empty `selectedDeckIds` means, so `isQuickPlay` is
 * always derived from the selection itself rather than passed in: a
 * fresh room (or one the Host has cleared every Deck back out of)
 * automatically plays the built-in sample Questions, and the moment
 * any Deck is added it's a Deck-hosted game instead - no separate mode
 * to switch between.
 *
 * `options` defaults describe a brand-new room's starting point
 * (Invite stage, dedicated Host); a caller preserving an existing
 * room's setup (e.g. after the Host edits just the duration) must pass
 * its current `status`/`hostParticipation` through explicitly, or this
 * would silently reset them.
 */
export async function buildPlannedGame(
  selectedDeckIds: string[],
  targetDurationSeconds: number,
  options: BuildPlannedGameOptions = {},
): Promise<PlannedGame> {
  const isQuickPlay = selectedDeckIds.length === 0;
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
 * The one room-creation path for every Host entry point: Landing's
 * "Host a Game" (no Deck preselected - opens Game Setup already on
 * Quick Play), "Host This Deck" from the Deck Editor/My Decks (one
 * Deck preselected), and My Decks' own Host button all funnel through
 * here. The room exists immediately - Players can join and the QR/room
 * code are live - before the Host has necessarily reached Game Setup
 * at all. `deck_snapshot` starts as a `kind: "planned_game"` object at
 * Invite stage that the Host keeps editing live once they reach Game
 * Setup (see useGameRoom's updateRoomSetup); Start Game later replaces
 * it with the frozen `kind: "game_plan"`.
 */
export async function createHostedRoom(preselectedDeckIds: string[] = []): Promise<string> {
  const roomCode = generateRoomCode();
  await ensureRoomExists(roomCode);

  const targetDurationSeconds = GAME_DURATION_MINUTES_DEFAULT * 60;
  const planned = await buildPlannedGame(preselectedDeckIds, targetDurationSeconds, { status: "invite" });
  await setRoomDeckSnapshot(roomCode, planned);
  return roomCode;
}
