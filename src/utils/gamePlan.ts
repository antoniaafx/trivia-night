import { MAX_DECKS_PER_GAME, QUESTION_TIMER_SECONDS_DEFAULT } from "../config/timingEstimates";
import { mapDeckQuestionToGameQuestion } from "./deckQuestionMapping";
import type { Question } from "../data/questions";
import type { DeckQuestionRecord } from "../types/deck";

const SNAPSHOT_VERSION = 1;

/**
 * Which of the two Host Lobby stages the room is currently in, while
 * `phase` is still 'lobby': Invite (just getting people connected, no
 * game settings shown) or Setup (the Host is configuring the game -
 * Deck selection, Question Timer, Question Flow, competition style,
 * Host Participation - all editable). There is no separate
 * "confirmed/locked" stage: Start Game is pressed directly from Setup,
 * and that's the only moment configuration locks (see migration 0007 -
 * competition style stays editable through both stages, keyed off
 * `phase`, not this field). Lives on the `planned_game` shape below,
 * not as a separate room column. The Host can move back to Invite from
 * Setup at any time (see useGameRoom's returnToInvite) without losing
 * anything already configured.
 */
export type LobbyStatus = "invite" | "setup";

/**
 * Whether the Host is a dedicated, non-competing facilitator
 * ("host_only") or intends to answer along with everyone else
 * ("playing_host"). This milestone only introduces the field, its
 * realtime sync, and its Setup/Ready display - it deliberately does not
 * yet implement any ownership-aware scoring behaviour. The intended
 * future rules (not implemented here):
 *
 *  1. Host plays a Deck they did NOT create: may eventually compete as
 *     an official competitor like any Player - they don't already know
 *     the answers. The private Host Dashboard must still never reveal
 *     an unrevealed Question's correct answer any differently than it
 *     does today.
 *  2. Host plays a Deck they DID create (or otherwise already knows):
 *     may eventually participate casually, but their score should be
 *     excluded from official standings - they have an unfair
 *     information advantage.
 *  3. Automatically detecting which of the above applies (deck
 *     ownership awareness) is future scope, not implemented now.
 */
export type HostParticipation = "host_only" | "playing_host";

/**
 * How each Question begins. "host_controlled" (the default - see
 * QUESTION_FLOW_DEFAULT) shows the Question with no countdown running,
 * so the Host can read it aloud and build suspense before pressing
 * Start Timer; "automatic" starts the countdown the instant the
 * Question appears, no Host interaction required. Only meaningful when
 * `questionTimerSeconds` is not null - with No Timer selected there is
 * no countdown to start either way, so this setting has no visible
 * effect (see the Host's QuestionPhase render logic).
 */
export type QuestionFlow = "host_controlled" | "automatic";

export const QUESTION_FLOW_DEFAULT: QuestionFlow = "host_controlled";

export interface GamePlanSection {
  deckId: string;
  deckTitle: string;
  questionIds: string[];
}

/**
 * The full multi-Deck game, frozen at Start Game and stored verbatim as
 * rooms.deck_snapshot from then on. `questions` is the flattened,
 * ordered sequence across every section, in Deck order, one entry per
 * Question in that Deck's own saved order - every complete Question
 * from every selected Deck is played, nothing is truncated or skipped.
 * The existing question-progression logic (getQuestionById/
 * getNextQuestionId in data/questions.ts) consumes this list directly
 * and has no idea multiple Decks were involved. `kind`/`version`
 * distinguish this frozen shape from the provisional PlannedGame
 * written while the Host is still configuring the game live in the
 * Lobby (see parseRoomDeckSnapshot).
 */
export interface GamePlan {
  kind: "game_plan";
  version: typeof SNAPSHOT_VERSION;
  sections: GamePlanSection[];
  questions: Question[];
  /** Carried forward verbatim from the confirmed PlannedGame at Start Game - see HostParticipation above. */
  hostParticipation: HostParticipation;
  /** null = No Timer. Applies uniformly to every Question in this game - see QuestionFlow's doc comment. */
  questionTimerSeconds: number | null;
  questionFlow: QuestionFlow;
}

export interface PlannedGameSection {
  deckId: string;
  deckTitle: string;
  selectedQuestionCount: number;
}

/**
 * A lightweight, Question-content-free projection of what Start Game
 * would currently produce - safe to broadcast to every Player and the
 * Stage while setup is still live, since it never includes
 * questionIds, correct answers, or accepted variants (only Deck names
 * and Question counts).
 */
export interface PlannedGamePlanSummary {
  deckCount: number;
  questionCount: number;
  sections: PlannedGameSection[];
}

/**
 * What the Host Lobby persists to rooms.deck_snapshot as soon as the
 * room is created, and updates on every setup change - Deck selection,
 * order, Question Timer, Question Flow, or Host Participation - while
 * rooms.phase is still 'lobby'. A Host refresh reads this back from the
 * same authoritative row; every connected Player and the Stage see the
 * same updates over the same realtime `rooms` subscription they already
 * hold, with no new plumbing. Every room gets one of these the moment
 * it's created (Quick Play included, via `isQuickPlay: true` - Quick
 * Play never has Decks to pick, but it still moves through the same
 * Invite/Setup stages so its Question Timer, Host Participation and
 * competition style follow the same lock timing as a Custom Game).
 * Start Game replaces this with a frozen GamePlan - except for Quick
 * Play, whose "plan" is just the hardcoded sample Questions, so nothing
 * needs freezing; its planned_game object is simply left in place,
 * still at `status: "setup"`, and the room's `phase` leaving 'lobby' is
 * what actually locks it (see migration 0007).
 */
export interface PlannedGame {
  kind: "planned_game";
  version: typeof SNAPSHOT_VERSION;
  isQuickPlay: boolean;
  selectedDeckIds: string[];
  planSummary: PlannedGamePlanSummary;
  status: LobbyStatus;
  hostParticipation: HostParticipation;
  questionTimerSeconds: number | null;
  questionFlow: QuestionFlow;
}

export type RoomDeckSnapshot = PlannedGame | GamePlan;

function isPlanSummaryShape(value: unknown): value is PlannedGamePlanSummary {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.deckCount === "number" && typeof v.questionCount === "number" && Array.isArray(v.sections);
}

function isLobbyStatus(value: unknown): value is LobbyStatus {
  return value === "invite" || value === "setup";
}

function isHostParticipation(value: unknown): value is HostParticipation {
  return value === "host_only" || value === "playing_host";
}

function isQuestionFlow(value: unknown): value is QuestionFlow {
  return value === "host_controlled" || value === "automatic";
}

function readQuestionTimerSeconds(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  return QUESTION_TIMER_SECONDS_DEFAULT;
}

/**
 * Never crashes on malformed/unrecognized JSON - returns null so the
 * caller can show a clear error instead. `status`/`hostParticipation`/
 * `isQuickPlay`/`questionTimerSeconds`/`questionFlow` are read
 * defensively with safe fallbacks rather than required, so a row
 * written before these fields existed (or a hand-edited/corrupted one)
 * is never rejected outright - it's just treated as an un-started,
 * dedicated-host, default-timer setup, which is always a safe (never
 * wrongly-locked) default. See migration 0006.
 */
export function parseRoomDeckSnapshot(raw: unknown): RoomDeckSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  if (
    value.kind === "planned_game" &&
    value.version === SNAPSHOT_VERSION &&
    Array.isArray(value.selectedDeckIds) &&
    value.selectedDeckIds.every((id) => typeof id === "string") &&
    isPlanSummaryShape(value.planSummary)
  ) {
    const plannedGame: PlannedGame = {
      kind: "planned_game",
      version: SNAPSHOT_VERSION,
      isQuickPlay: value.isQuickPlay === true,
      selectedDeckIds: value.selectedDeckIds as string[],
      planSummary: value.planSummary,
      status: isLobbyStatus(value.status) ? value.status : "invite",
      hostParticipation: isHostParticipation(value.hostParticipation) ? value.hostParticipation : "host_only",
      questionTimerSeconds:
        "questionTimerSeconds" in value ? readQuestionTimerSeconds(value.questionTimerSeconds) : QUESTION_TIMER_SECONDS_DEFAULT,
      questionFlow: isQuestionFlow(value.questionFlow) ? value.questionFlow : QUESTION_FLOW_DEFAULT,
    };
    return plannedGame;
  }

  if (
    value.kind === "game_plan" &&
    value.version === SNAPSHOT_VERSION &&
    Array.isArray(value.sections) &&
    Array.isArray(value.questions) &&
    value.questions.length > 0
  ) {
    const gamePlan: GamePlan = {
      kind: "game_plan",
      version: SNAPSHOT_VERSION,
      sections: value.sections as GamePlanSection[],
      questions: value.questions as Question[],
      hostParticipation: isHostParticipation(value.hostParticipation) ? value.hostParticipation : "host_only",
      questionTimerSeconds:
        "questionTimerSeconds" in value ? readQuestionTimerSeconds(value.questionTimerSeconds) : QUESTION_TIMER_SECONDS_DEFAULT,
      questionFlow: isQuestionFlow(value.questionFlow) ? value.questionFlow : QUESTION_FLOW_DEFAULT,
    };
    return gamePlan;
  }

  return null;
}

/**
 * The single place that decides which of the two Host Lobby stages a
 * room is currently in, while `phase` is still 'lobby'. A frozen
 * `game_plan` present during the lobby phase only ever means a
 * post-Play-Again rematch, whose setup is always locked/read-only - so
 * it's always "setup" (never "invite" - a rematch never goes through a
 * fresh Invite screen). A `null` snapshot only happens for a legacy
 * room from before this restructure; treating it as "invite" is the
 * safest fallback (never skips a stage the Host hasn't actually seen).
 */
export function deriveLobbyStage(deckSnapshot: RoomDeckSnapshot | null): LobbyStatus {
  if (!deckSnapshot) return "invite";
  if (deckSnapshot.kind === "game_plan") return "setup";
  return deckSnapshot.status;
}

export interface DeckPlanInput {
  deckId: string;
  deckTitle: string;
  /** Must already be filtered to complete Questions, in saved order - see computeDeckReadiness. */
  questions: DeckQuestionRecord[];
}

export type GameSetupValidation = { valid: true } | { valid: false; reason: string };

/** Enforced here too, not just in the picker UI - the Game Plan itself must never accept an invalid selection. */
export function validateDeckSelection(decks: DeckPlanInput[]): GameSetupValidation {
  if (decks.length === 0) {
    return { valid: false, reason: "Choose at least one Deck." };
  }
  if (decks.length > MAX_DECKS_PER_GAME) {
    return { valid: false, reason: `You can choose up to ${MAX_DECKS_PER_GAME} Decks for one game.` };
  }
  const totalQuestions = decks.reduce((sum, deck) => sum + deck.questions.length, 0);
  if (totalQuestions === 0) {
    return { valid: false, reason: "The selected Decks don't contain any Questions yet." };
  }
  return { valid: true };
}

/**
 * The game length is determined entirely by the selected Decks: every
 * complete Question from every selected Deck is played, in the Host's
 * chosen Deck order and each Deck's own saved Question order - no
 * budget, no allocation, no truncation, no hidden skipping. A Question
 * that has no Questions at all simply contributes an empty section
 * (validateDeckSelection is what actually blocks that combination from
 * reaching Start Game).
 */
export function computeGamePlan(
  decks: DeckPlanInput[],
): Omit<GamePlan, "hostParticipation" | "questionTimerSeconds" | "questionFlow"> {
  const sections: GamePlanSection[] = decks.map((deck) => ({
    deckId: deck.deckId,
    deckTitle: deck.deckTitle,
    questionIds: deck.questions.map((question) => question.id),
  }));

  const questionById = new Map(decks.flatMap((deck) => deck.questions).map((question) => [question.id, question]));

  const questions = sections.flatMap((section) =>
    section.questionIds.map((id) => mapDeckQuestionToGameQuestion(questionById.get(id)!)),
  );

  return {
    kind: "game_plan",
    version: SNAPSHOT_VERSION,
    sections,
    questions,
  };
}

/**
 * The Question-content-free projection shown to Players and the Stage
 * while setup is still live - computed by running the exact same
 * Deck-concatenation logic and then stripping out questionIds, so the
 * summary can never drift from what Start Game would actually produce.
 */
export function computePlanSummary(decks: DeckPlanInput[]): PlannedGamePlanSummary {
  const plan = computeGamePlan(decks);
  return {
    deckCount: plan.sections.length,
    questionCount: plan.questions.length,
    sections: plan.sections.map((section) => ({
      deckId: section.deckId,
      deckTitle: section.deckTitle,
      selectedQuestionCount: section.questionIds.length,
    })),
  };
}

/**
 * Which section a given Question belongs to, and its 1-based position
 * among the sections - what Host/Player/Stage use for the lightweight
 * "Music — Deck 2 of 3" beat. Returns null for Quick Play (no plan) or
 * a Question id the plan doesn't recognize.
 */
export function findSectionForQuestion(
  plan: Pick<GamePlan, "sections">,
  questionId: string | null,
): { section: GamePlanSection; sectionNumber: number; totalSections: number } | null {
  if (!questionId) return null;
  const index = plan.sections.findIndex((section) => section.questionIds.includes(questionId));
  if (index === -1) return null;
  return { section: plan.sections[index], sectionNumber: index + 1, totalSections: plan.sections.length };
}
