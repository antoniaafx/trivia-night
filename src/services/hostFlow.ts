import { generateRoomCode } from "./roomCode";
import { ensureRoomExists, setRoomDeckSnapshot } from "./gameRoomRepository";
import { fetchDeck, fetchDeckQuestions } from "./deckRepository";
import { computePlanSummary, QUESTION_FLOW_DEFAULT } from "../utils/gamePlan";
import { isQuestionComplete } from "../utils/deckValidation";
import { QUESTION_TIMER_SECONDS_DEFAULT } from "../config/timingEstimates";
import type { HostParticipation, LobbyStatus, PlannedGame, DeckPlanInput, QuestionFlow } from "../utils/gamePlan";

const QUESTION_TIMER_PREFERENCE_KEY = "trivia-night:question-timer-seconds";
const QUESTION_FLOW_PREFERENCE_KEY = "trivia-night:question-flow";

/**
 * "Save locally: Question Timer, Question Flow... pre-fill the previous
 * choices" - a convenience only, scoped to this browser via localStorage
 * (same persistence tier as useCreatorId), never synced anywhere. Read
 * once, by createHostedRoom below, whenever a brand-new room's initial
 * planned_game is built; an existing room's live Setup edits always win
 * over these once the Host actually changes something (see
 * saveQuestionTimerPreferences).
 */
function loadQuestionTimerPreferences(): { questionTimerSeconds: number | null; questionFlow: QuestionFlow } {
  const storedSeconds = localStorage.getItem(QUESTION_TIMER_PREFERENCE_KEY);
  const storedFlow = localStorage.getItem(QUESTION_FLOW_PREFERENCE_KEY);

  const questionTimerSeconds =
    storedSeconds === null ? QUESTION_TIMER_SECONDS_DEFAULT : storedSeconds === "null" ? null : Number(storedSeconds);
  const questionFlow: QuestionFlow = storedFlow === "automatic" ? "automatic" : QUESTION_FLOW_DEFAULT;

  return {
    questionTimerSeconds: Number.isNaN(questionTimerSeconds) ? QUESTION_TIMER_SECONDS_DEFAULT : questionTimerSeconds,
    questionFlow,
  };
}

/** Called whenever the Host changes either setting during live Game Setup - see useGameRoom's setQuestionTimer/setQuestionFlow. */
export function saveQuestionTimerPreferences(questionTimerSeconds: number | null, questionFlow: QuestionFlow): void {
  localStorage.setItem(QUESTION_TIMER_PREFERENCE_KEY, questionTimerSeconds === null ? "null" : String(questionTimerSeconds));
  localStorage.setItem(QUESTION_FLOW_PREFERENCE_KEY, questionFlow);
}

interface BuildPlannedGameOptions {
  status?: LobbyStatus;
  hostParticipation?: HostParticipation;
  questionTimerSeconds?: number | null;
  questionFlow?: QuestionFlow;
}

/**
 * Builds the `planned_game` snapshot for a given Deck selection - shared
 * by room creation (below) and live setup edits made from inside the
 * Host Lobby (see useGameRoom's updateRoomSetup/setHostParticipation/
 * setQuestionTimer/setQuestionFlow), so every path computes the same
 * summary the same way and can never drift. Quick Play isn't a separate
 * choice the caller makes - it's just what an empty `selectedDeckIds`
 * means, so `isQuickPlay` is always derived from the selection itself
 * rather than passed in: a fresh room (or one the Host has cleared
 * every Deck back out of) automatically plays the built-in sample
 * Questions, and the moment any Deck is added it's a Deck-hosted game
 * instead - no separate mode to switch between.
 *
 * `options` defaults describe a brand-new room's starting point (Invite
 * stage, dedicated Host, this browser's saved Question Timer/Flow
 * preferences - see loadQuestionTimerPreferences); a caller preserving
 * an existing room's setup (e.g. after the Host edits just the Deck
 * selection) must pass its current `status`/`hostParticipation`/
 * `questionTimerSeconds`/`questionFlow` through explicitly, or this
 * would silently reset them.
 */
export async function buildPlannedGame(
  selectedDeckIds: string[],
  options: BuildPlannedGameOptions = {},
): Promise<PlannedGame> {
  const isQuickPlay = selectedDeckIds.length === 0;
  const status = options.status ?? "invite";
  const hostParticipation = options.hostParticipation ?? "host_only";
  const preferences = loadQuestionTimerPreferences();
  const questionTimerSeconds =
    options.questionTimerSeconds !== undefined ? options.questionTimerSeconds : preferences.questionTimerSeconds;
  const questionFlow = options.questionFlow ?? preferences.questionFlow;

  if (selectedDeckIds.length === 0) {
    return {
      kind: "planned_game",
      version: 1,
      isQuickPlay,
      selectedDeckIds: [],
      planSummary: { deckCount: 0, questionCount: 0, sections: [] },
      status,
      hostParticipation,
      questionTimerSeconds,
      questionFlow,
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
    selectedDeckIds,
    planSummary: computePlanSummary(deckInputs),
    status,
    hostParticipation,
    questionTimerSeconds,
    questionFlow,
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

  const planned = await buildPlannedGame(preselectedDeckIds, { status: "invite" });
  await setRoomDeckSnapshot(roomCode, planned);
  return roomCode;
}
