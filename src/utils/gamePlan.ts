import {
  MAX_DECKS_PER_GAME,
  QUESTION_SECONDS_ESTIMATE,
  SECTION_TRANSITION_SECONDS_ESTIMATE,
} from "../config/timingEstimates";
import { mapDeckQuestionToGameQuestion } from "./deckQuestionMapping";
import type { Question } from "../data/questions";
import type { DeckQuestionRecord } from "../types/deck";

const SNAPSHOT_VERSION = 1;

/**
 * Which of the three Host Lobby stages the room is currently in, while
 * `phase` is still 'lobby': Invite (just getting people connected, no
 * game settings shown), Setup (the Host is actively configuring the
 * game, editable), or Ready (Setup has been confirmed - Deck selection,
 * duration, and competition style are locked; only Start Game or Edit
 * Setup remain). Lives on the `planned_game` shape below, not as a
 * separate room column - see migration 0006 for why the DB-level
 * competition-style lock reads this same field.
 */
export type LobbyStatus = "invite" | "setup" | "ready";

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

export interface GamePlanSection {
  deckId: string;
  deckTitle: string;
  allocatedSeconds: number;
  estimatedSeconds: number;
  questionIds: string[];
}

/**
 * The full multi-Deck game, frozen at Start Game and stored verbatim as
 * rooms.deck_snapshot from then on. `questions` is the flattened,
 * ordered sequence across every section - the existing question-
 * progression logic (getQuestionById/getNextQuestionId in
 * data/questions.ts) consumes this list directly and has no idea
 * multiple Decks were involved. `kind`/`version` distinguish this
 * frozen shape from the provisional PlannedGame written while the Host
 * is still configuring the game live in the Lobby (see
 * parseRoomDeckSnapshot). All durations are stored in seconds for
 * precision; only the UI converts to minutes for display.
 */
export interface GamePlan {
  kind: "game_plan";
  version: typeof SNAPSHOT_VERSION;
  totalDurationSeconds: number;
  /** Question time + section-transition allowance - not the final Leaderboard/Winner ceremony. See timingEstimates.ts. */
  estimatedDurationSeconds: number;
  sections: GamePlanSection[];
  questions: Question[];
  /** Carried forward verbatim from the confirmed PlannedGame at Start Game - see HostParticipation above. */
  hostParticipation: HostParticipation;
}

export interface PlannedGameSection {
  deckId: string;
  deckTitle: string;
  selectedQuestionCount: number;
  allocatedSeconds: number;
  estimatedSeconds: number;
}

/**
 * A lightweight, Question-content-free projection of what Start Game
 * would currently produce - safe to broadcast to every Player and the
 * Stage while setup is still live, since it never includes
 * questionIds, correct answers, or accepted variants (only counts and
 * estimates).
 */
export interface PlannedGamePlanSummary {
  deckCount: number;
  questionCount: number;
  estimatedDurationSeconds: number;
  sections: PlannedGameSection[];
}

/**
 * What the Host Lobby persists to rooms.deck_snapshot as soon as the
 * room is created, and updates on every setup change - Deck selection,
 * order, target duration, or Host Participation - while rooms.phase is
 * still 'lobby'. A Host refresh reads this back from the same
 * authoritative row; every connected Player and the Stage see the same
 * updates over the same realtime `rooms` subscription they already
 * hold, with no new plumbing. Every room gets one of these the moment
 * it's created (Quick Play included, via `isQuickPlay: true` - Quick
 * Play never has Decks to pick, but it still moves through the same
 * Invite/Setup/Ready stages so its Host Participation and competition
 * style follow the same lock timing as a Custom Game). Start Game
 * replaces this with a frozen GamePlan - except for Quick Play, whose
 * "plan" is just the hardcoded sample Questions, so nothing needs
 * freezing; its planned_game object is simply left in place with
 * `status: "ready"`.
 */
export interface PlannedGame {
  kind: "planned_game";
  version: typeof SNAPSHOT_VERSION;
  isQuickPlay: boolean;
  targetDurationSeconds: number;
  selectedDeckIds: string[];
  planSummary: PlannedGamePlanSummary;
  status: LobbyStatus;
  hostParticipation: HostParticipation;
}

export type RoomDeckSnapshot = PlannedGame | GamePlan;

function isPlanSummaryShape(value: unknown): value is PlannedGamePlanSummary {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.deckCount === "number" &&
    typeof v.questionCount === "number" &&
    typeof v.estimatedDurationSeconds === "number" &&
    Array.isArray(v.sections)
  );
}

function isLobbyStatus(value: unknown): value is LobbyStatus {
  return value === "invite" || value === "setup" || value === "ready";
}

function isHostParticipation(value: unknown): value is HostParticipation {
  return value === "host_only" || value === "playing_host";
}

/**
 * Never crashes on malformed/unrecognized JSON - returns null so the
 * caller can show a clear error instead. `status`/`hostParticipation`/
 * `isQuickPlay` are read defensively with safe fallbacks rather than
 * required, so a row written before these fields existed (or a
 * hand-edited/corrupted one) is never rejected outright - it's just
 * treated as an un-started, dedicated-host setup, which is always a
 * safe (never wrongly-locked) default. See migration 0006.
 */
export function parseRoomDeckSnapshot(raw: unknown): RoomDeckSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  if (
    value.kind === "planned_game" &&
    value.version === SNAPSHOT_VERSION &&
    typeof value.targetDurationSeconds === "number" &&
    Array.isArray(value.selectedDeckIds) &&
    value.selectedDeckIds.every((id) => typeof id === "string") &&
    isPlanSummaryShape(value.planSummary)
  ) {
    const plannedGame: PlannedGame = {
      kind: "planned_game",
      version: SNAPSHOT_VERSION,
      isQuickPlay: value.isQuickPlay === true,
      targetDurationSeconds: value.targetDurationSeconds,
      selectedDeckIds: value.selectedDeckIds as string[],
      planSummary: value.planSummary,
      status: isLobbyStatus(value.status) ? value.status : "invite",
      hostParticipation: isHostParticipation(value.hostParticipation) ? value.hostParticipation : "host_only",
    };
    return plannedGame;
  }

  if (
    value.kind === "game_plan" &&
    value.version === SNAPSHOT_VERSION &&
    typeof value.totalDurationSeconds === "number" &&
    typeof value.estimatedDurationSeconds === "number" &&
    Array.isArray(value.sections) &&
    Array.isArray(value.questions) &&
    value.questions.length > 0
  ) {
    const gamePlan: GamePlan = {
      kind: "game_plan",
      version: SNAPSHOT_VERSION,
      totalDurationSeconds: value.totalDurationSeconds,
      estimatedDurationSeconds: value.estimatedDurationSeconds,
      sections: value.sections as GamePlanSection[],
      questions: value.questions as Question[],
      hostParticipation: isHostParticipation(value.hostParticipation) ? value.hostParticipation : "host_only",
    };
    return gamePlan;
  }

  return null;
}

/**
 * The single place that decides which of the three Host Lobby stages a
 * room is currently in, while `phase` is still 'lobby'. A frozen
 * `game_plan` present during the lobby phase only ever means a
 * post-Play-Again rematch, whose setup is always locked/read-only - so
 * it's always "ready", never "invite" or "setup". A `null` snapshot
 * only happens for a legacy room from before this restructure; treating
 * it as "invite" is the safest fallback (never skips a stage the Host
 * hasn't actually seen).
 */
export function deriveLobbyStage(deckSnapshot: RoomDeckSnapshot | null): LobbyStatus {
  if (!deckSnapshot) return "invite";
  if (deckSnapshot.kind === "game_plan") return "ready";
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

function estimateSecondsFor(question: DeckQuestionRecord): number {
  return QUESTION_SECONDS_ESTIMATE[question.answerMethod];
}

/**
 * Walks a Deck's own saved order, greedily including Questions while
 * they fit the budget. Always includes at least one Question (a
 * section with zero Questions isn't a section) even if that single
 * Question alone exceeds the budget - never randomizes, never repeats
 * a Question, never reorders. All arithmetic here is integer seconds.
 */
export function selectQuestionsForBudget(
  questions: DeckQuestionRecord[],
  budgetSeconds: number,
): { selectedIds: string[]; usedSeconds: number } {
  const selectedIds: string[] = [];
  let usedSeconds = 0;

  for (const question of questions) {
    const cost = estimateSecondsFor(question);
    if (selectedIds.length > 0 && usedSeconds + cost > budgetSeconds) break;
    selectedIds.push(question.id);
    usedSeconds += cost;
  }

  return { selectedIds, usedSeconds };
}

/**
 * Splits `totalSeconds` into `count` integer shares that sum back to
 * exactly `totalSeconds` - any remainder from the floor division goes
 * to the earliest entries, in order, one extra second each. This is the
 * one rounding rule used both for the initial equal Deck split and for
 * redistributing unused time, so allocation is always deterministic and
 * never loses a second to rounding.
 */
function splitIntegerSeconds(totalSeconds: number, count: number): number[] {
  if (count === 0) return [];
  const base = Math.floor(totalSeconds / count);
  const remainder = totalSeconds - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export interface GamePlanWarning {
  type: "minimum_exceeds_target" | "shortfall";
  message: string;
}

/**
 * Deterministic, single-redistribution-pass allocation:
 *
 * 1. The total duration splits into integer-second shares, one per
 *    Deck, in the Host's chosen order (see splitIntegerSeconds).
 * 2. Each Deck greedily selects Questions from its own saved order
 *    within that share (see selectQuestionsForBudget).
 * 3. Any Deck that couldn't fill its share (ran out of complete
 *    Questions) contributes its unused seconds to a single pool.
 * 4. That pool is split, once, across whichever Decks had more
 *    Questions available than their initial share could fit, using the
 *    same integer-second rule, and those Decks re-select with their
 *    enlarged budget.
 *
 * This is intentionally one pass, not iterative: a Deck still
 * under-filled after its bonus share simply stays that way rather than
 * triggering another round. estimatedDurationSeconds is the honest
 * total - Question time actually selected, plus one fixed transition
 * allowance per Deck boundary - and can legitimately end up either
 * below or above the target; warnings surface both cases rather than
 * silently mis-stating either.
 */
/**
 * Deliberately omits `hostParticipation`: that field belongs to the Host's
 * confirmed setup, not to this pure duration/Question-allocation
 * calculation, and this function is called both by the real Start Game
 * write (which does know the confirmed value and spreads it on top) and
 * by the live, Question-content-free preview in computePlanSummary/
 * GameSetupPanel (which doesn't need it at all).
 */
export function computeGamePlan(
  decks: DeckPlanInput[],
  targetDurationSeconds: number,
): Omit<GamePlan, "hostParticipation"> {
  const totalBudgetSeconds = Math.round(targetDurationSeconds);
  const shares = splitIntegerSeconds(totalBudgetSeconds, decks.length);

  const initial = decks.map((deck, index) => {
    const budgetSeconds = shares[index];
    const { selectedIds, usedSeconds } = selectQuestionsForBudget(deck.questions, budgetSeconds);
    return { deck, selectedIds, usedSeconds, budgetSeconds };
  });

  const totalUnusedSeconds = initial.reduce(
    (sum, entry) => sum + Math.max(0, entry.budgetSeconds - entry.usedSeconds),
    0,
  );
  const eligibleForBonus = initial.filter((entry) => entry.selectedIds.length < entry.deck.questions.length);
  const bonusShares = splitIntegerSeconds(totalUnusedSeconds, eligibleForBonus.length);
  const eligibleDeckIds = new Set(eligibleForBonus.map((entry) => entry.deck.deckId));

  let bonusCursor = 0;
  const final = initial.map((entry) => {
    if (totalUnusedSeconds <= 0 || !eligibleDeckIds.has(entry.deck.deckId)) return entry;
    const bonus = bonusShares[bonusCursor];
    bonusCursor += 1;
    const { selectedIds, usedSeconds } = selectQuestionsForBudget(entry.deck.questions, entry.budgetSeconds + bonus);
    return { ...entry, selectedIds, usedSeconds };
  });

  const questionById = new Map(decks.flatMap((deck) => deck.questions).map((question) => [question.id, question]));

  const sections: GamePlanSection[] = final.map((entry) => ({
    deckId: entry.deck.deckId,
    deckTitle: entry.deck.deckTitle,
    allocatedSeconds: entry.budgetSeconds,
    estimatedSeconds: entry.usedSeconds,
    questionIds: entry.selectedIds,
  }));

  const questionSeconds = sections.reduce((sum, section) => sum + section.estimatedSeconds, 0);
  const transitionSeconds = Math.max(0, sections.length - 1) * SECTION_TRANSITION_SECONDS_ESTIMATE;
  const estimatedDurationSeconds = questionSeconds + transitionSeconds;

  const questions = sections.flatMap((section) =>
    section.questionIds.map((id) => mapDeckQuestionToGameQuestion(questionById.get(id)!)),
  );

  return {
    kind: "game_plan",
    version: SNAPSHOT_VERSION,
    totalDurationSeconds: totalBudgetSeconds,
    estimatedDurationSeconds,
    sections,
    questions,
  };
}

/**
 * The Question-content-free projection shown to Players and the Stage
 * while setup is still live - computed by running the exact same
 * deterministic allocation and then stripping out questionIds/correct
 * answers, so the summary can never drift from what Start Game would
 * actually produce.
 */
export function computePlanSummary(decks: DeckPlanInput[], targetDurationSeconds: number): PlannedGamePlanSummary {
  const plan = computeGamePlan(decks, targetDurationSeconds);
  return {
    deckCount: plan.sections.length,
    questionCount: plan.questions.length,
    estimatedDurationSeconds: plan.estimatedDurationSeconds,
    sections: plan.sections.map((section) => ({
      deckId: section.deckId,
      deckTitle: section.deckTitle,
      selectedQuestionCount: section.questionIds.length,
      allocatedSeconds: section.allocatedSeconds,
      estimatedSeconds: section.estimatedSeconds,
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
  plan: Omit<GamePlan, "hostParticipation">,
  questionId: string | null,
): { section: GamePlanSection; sectionNumber: number; totalSections: number } | null {
  if (!questionId) return null;
  const index = plan.sections.findIndex((section) => section.questionIds.includes(questionId));
  if (index === -1) return null;
  return { section: plan.sections[index], sectionNumber: index + 1, totalSections: plan.sections.length };
}

/** Warnings are advisory, never blocking - the Host can continue with a shorter or longer game than requested. */
export function computeGamePlanWarnings(plan: Omit<GamePlan, "hostParticipation">): GamePlanWarning[] {
  const targetSeconds = plan.totalDurationSeconds;
  const warnings: GamePlanWarning[] = [];

  if (plan.estimatedDurationSeconds > targetSeconds) {
    const minutes = Math.ceil(plan.estimatedDurationSeconds / 60);
    warnings.push({
      type: "minimum_exceeds_target",
      message: `Your selected Decks need at least approximately ${minutes} minute${minutes === 1 ? "" : "s"}. Increase the game time or remove a Deck.`,
    });
  } else if (plan.estimatedDurationSeconds < targetSeconds) {
    const allDecksFullyUsed = plan.sections.every((section) => section.estimatedSeconds <= section.allocatedSeconds);
    const anyDeckShort = plan.sections.some((section) => section.estimatedSeconds < section.allocatedSeconds);
    if (allDecksFullyUsed && anyDeckShort) {
      const minutes = Math.round(plan.estimatedDurationSeconds / 60);
      const targetMinutes = Math.round(targetSeconds / 60);
      warnings.push({
        type: "shortfall",
        message: `Your selected Decks contain approximately ${minutes} minute${minutes === 1 ? "" : "s"} of trivia. Your target is ${targetMinutes} minutes.`,
      });
    }
  }

  return warnings;
}
