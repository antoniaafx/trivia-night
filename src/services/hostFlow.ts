import { generateRoomCode } from "./roomCode";
import { ensureRoomExists, fetchRoom, setRoomDeckSnapshot } from "./gameRoomRepository";
import { fetchDeck, fetchDeckQuestions } from "./deckRepository";
import { computePlanSummary } from "../utils/gamePlan";
import { isQuestionComplete } from "../utils/deckValidation";
import { GAME_DURATION_MINUTES_DEFAULT, MAX_DECKS_PER_GAME } from "../config/timingEstimates";
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

export type RoomSelectionStatus = "valid" | "not_found" | "not_editable";

/**
 * Read-only check for whether `roomCode` can currently accept a Deck
 * selection from outside its own Game Setup screen (My Decks/Deck
 * Editor reached via `?selectForRoom=`). "not_editable" covers both an
 * already-started/ended game (`phase !== "lobby"`) and a locked
 * Play-Again rematch (`deck_snapshot.kind === "game_plan"`) - neither
 * has an editable Deck list to add to. Used both to drive the page's
 * own banner/button state on load and, independently, inside
 * addDeckToRoom immediately before it writes - a page-load check alone
 * could go stale if the Host starts the game in another tab while this
 * page is still open.
 */
export async function checkRoomSelectable(roomCode: string): Promise<RoomSelectionStatus> {
  const room = await fetchRoom(roomCode);
  if (!room) return "not_found";
  if (room.phase !== "lobby" || room.deckSnapshot?.kind !== "planned_game") return "not_editable";
  return "valid";
}

export type AddDeckToRoomResult = { ok: true } | { ok: false; reason: RoomSelectionStatus | "deck_limit_reached" };

/**
 * The "select this Deck for the game I'm already running" counterpart
 * to createHostedRoom - used when the Host reaches My Decks or the
 * Deck Editor from an active room's Game Setup (see MyDecksPage's and
 * DeckEditorPage's `selectForRoom` handling) instead of always
 * spinning up a brand-new room. Appends `deckId` to that room's
 * current `selectedDeckIds` (no duplicates, existing order preserved,
 * capped at MAX_DECKS_PER_GAME same as the embedded picker), rebuilds
 * the planned_game exactly the way useGameRoom's updateRoomSetup does,
 * and writes it back through the same setRoomDeckSnapshot path.
 * `targetDurationSeconds`/`status`/`hostParticipation` are read from
 * the room's own current snapshot and passed straight through
 * unchanged. Every other client already subscribed to this room's
 * realtime channel - including the Host's own Game Setup tab, if still
 * open - picks the change up live; nothing here performs navigation or
 * touches `phase`, competition style, Players, or Teams.
 */
export async function addDeckToRoom(roomCode: string, deckId: string): Promise<AddDeckToRoomResult> {
  const room = await fetchRoom(roomCode);
  if (!room) return { ok: false, reason: "not_found" };
  if (room.phase !== "lobby" || room.deckSnapshot?.kind !== "planned_game") {
    return { ok: false, reason: "not_editable" };
  }

  const snapshot = room.deckSnapshot;
  const alreadySelected = snapshot.selectedDeckIds.includes(deckId);
  if (!alreadySelected && snapshot.selectedDeckIds.length >= MAX_DECKS_PER_GAME) {
    return { ok: false, reason: "deck_limit_reached" };
  }

  const nextSelectedDeckIds = alreadySelected ? snapshot.selectedDeckIds : [...snapshot.selectedDeckIds, deckId];

  const planned = await buildPlannedGame(nextSelectedDeckIds, snapshot.targetDurationSeconds, {
    status: snapshot.status,
    hostParticipation: snapshot.hostParticipation,
  });
  await setRoomDeckSnapshot(roomCode, planned);
  return { ok: true };
}
