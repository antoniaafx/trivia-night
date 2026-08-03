import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { FIRST_QUESTION_ID, getNextQuestionId, getQuestionById, QUESTIONS, type Question } from "../data/questions";
import { computeWinners, isEventForCurrentInstance, isEventForCurrentQuestion } from "../utils/scoring";
import { computeDeckReadiness } from "../utils/deckValidation";
import { computeGamePlan, deriveLobbyStage, parseRoomDeckSnapshot, validateDeckSelection } from "../utils/gamePlan";
import type { DeckPlanInput, HostParticipation, LobbyStatus, PlannedGame } from "../utils/gamePlan";
import { GAME_DURATION_MINUTES_DEFAULT } from "../config/timingEstimates";
import { playerToCompetitor, teamToCompetitor } from "../types/game";
import {
  cleanupEmptyTeams,
  createTeam as createTeamRow,
  ensureRoomExists,
  fetchAnswers,
  fetchPlayers,
  fetchRoom,
  fetchTeamAnswers,
  fetchTeams,
  resetRoomForNewGame,
  revealAndScore,
  reviewAnswer as reviewAnswerRow,
  reviewTeamAnswer as reviewTeamAnswerRow,
  setCompetitionStyle as setCompetitionStyleRow,
  setPlayerTeam,
  setRoomDeckSnapshot,
  submitAnswer as submitAnswerRow,
  submitTeamAnswer as submitTeamAnswerRow,
  submitTeamTypedAnswer as submitTeamTypedAnswerRow,
  submitTypedAnswer as submitTypedAnswerRow,
  transitionPhase,
  upsertPlayer,
} from "../services/gameRoomRepository";
import { fetchDeck, fetchDeckQuestions, markDeckHosted } from "../services/deckRepository";
import { buildPlannedGame } from "../services/hostFlow";
import { isSupabaseConfigured, supabase } from "../services/supabaseClient";
import type {
  AnswerRecord,
  CompetitionStyle,
  GradingStatus,
  PlayerRecord,
  RoomRecord,
  TeamAnswerRecord,
  TeamRecord,
} from "../types/game";
import type { RoomPlayer } from "../types/room";

export type GameConnectionStatus = "unconfigured" | "connecting" | "connected" | "disconnected";

interface UseGameRoomOptions {
  roomCode: string;
  /** Pass null for a read-only viewer (the Stage) that never writes anything. */
  self: RoomPlayer | null;
}

interface UseGameRoomResult {
  connectionStatus: GameConnectionStatus;
  loading: boolean;
  roomNotFound: boolean;
  room: RoomRecord | null;
  players: PlayerRecord[];
  /** Scoped to room.currentQuestionId - a previous question's answers are cleared the moment the room advances. */
  answers: AnswerRecord[];
  teams: TeamRecord[];
  /** Scoped to room.currentQuestionId - see `answers`. */
  teamAnswers: TeamAnswerRecord[];
  /** The active Question list for this room: Quick Play sample Questions, or the frozen multi-Deck Game Plan's flattened sequence. */
  questionList: Question[];
  myAnswerOptionId: string | null;
  myTypedAnswerText: string | null;
  myGradingStatus: GradingStatus | null;
  myTeamId: string | null;
  myTeamAnswerOptionId: string | null;
  myTeamTypedAnswerText: string | null;
  myTeamGradingStatus: GradingStatus | null;
  /** Non-null only in Team mode: how many active Players still lack a Team, phrased for direct display. Null means Start Game's Team gate is clear. */
  teamReadinessProblem: string | null;
  /**
   * Which of the three Host Lobby stages this room is currently in
   * (while phase is still 'lobby') - see gamePlan.ts's deriveLobbyStage.
   * Host, Player, and Stage all derive their lobby rendering from this
   * single value so it can never drift between clients.
   */
  lobbyStage: LobbyStatus;
  setCompetitionStyle: (style: CompetitionStyle) => Promise<{ ok: boolean }>;
  createTeam: (name: string) => Promise<TeamRecord>;
  joinTeam: (teamId: string) => Promise<void>;
  leaveTeam: () => Promise<void>;
  /**
   * Persists a live Deck-selection/duration change made from inside the
   * Host Lobby as the room's `planned_game` snapshot. Only valid during
   * the Setup stage and only when no frozen Game Plan already exists for
   * this room (a rematch Lobby's setup is locked/read-only) - rejects
   * otherwise so a stray call can never clobber a locked setup.
   */
  updateRoomSetup: (selectedDeckIds: string[], targetDurationSeconds: number) => Promise<void>;
  /** Sets Host Participation ("host_only" | "playing_host") during the Setup stage. See gamePlan.ts's HostParticipation for the intended future rules this is architected for. */
  setHostParticipation: (value: HostParticipation) => Promise<void>;
  /** Invite -> Setup. Always available - the Host can move on with zero Players joined. */
  advanceToSetup: () => Promise<void>;
  /**
   * Setup -> Ready. Revalidates Deck selection/readiness (for a
   * non-Quick-Play room) before locking - this is the moment competition
   * style and structural configuration become locked (see migration
   * 0006), not Start Game.
   */
  confirmSetup: () => Promise<{ ok: boolean; error?: string }>;
  /** Ready -> Setup. Unlocks configuration again; must be re-confirmed before Start Game. Not available for a locked rematch. */
  editSetup: () => Promise<void>;
  startGame: () => Promise<{ ok: boolean; error?: string }>;
  submitAnswer: (optionId: string) => Promise<void>;
  submitTypedAnswer: (text: string) => Promise<void>;
  submitTeamAnswer: (optionId: string) => Promise<void>;
  submitTeamTypedAnswer: (text: string) => Promise<void>;
  revealAnswer: () => Promise<void>;
  advanceQuestion: () => Promise<void>;
  reviewAnswer: (clientId: string, decision: "correct" | "incorrect") => Promise<void>;
  reviewTeamAnswer: (teamId: string, decision: "correct" | "incorrect") => Promise<void>;
  showLeaderboard: () => Promise<void>;
  showWinner: () => Promise<void>;
  playAgain: () => Promise<void>;
}

export function useGameRoom({ roomCode, self }: UseGameRoomOptions): UseGameRoomResult {
  const [connectionStatus, setConnectionStatus] = useState<GameConnectionStatus>(
    isSupabaseConfigured ? "connecting" : "unconfigured",
  );
  const [loading, setLoading] = useState(true);
  const [roomNotFound, setRoomNotFound] = useState(false);
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [teamAnswers, setTeamAnswers] = useState<TeamAnswerRecord[]>([]);

  // Realtime callbacks are set up once per mount, but need to compare
  // incoming events against the *latest* game instance/question, not
  // whatever was current when the subscription was created - refs avoid
  // stale closures without re-subscribing on every room update.
  const gameInstanceIdRef = useRef<string | null>(null);
  const currentQuestionIdRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setConnectionStatus("unconfigured");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setRoomNotFound(false);

    async function bootstrap() {
      // Only the host creates a room; a player never conjures one into
      // existence just by visiting a link.
      if (self?.isHost) {
        await ensureRoomExists(roomCode);
      }

      const existingRoom = await fetchRoom(roomCode);
      if (cancelled) return;

      if (!existingRoom) {
        setRoomNotFound(true);
        setLoading(false);
        return;
      }

      gameInstanceIdRef.current = existingRoom.gameInstanceId;
      currentQuestionIdRef.current = existingRoom.currentQuestionId;
      setRoom(existingRoom);

      if (self) {
        // A room_players row requires an existing room (foreign key), so
        // this only ever runs once we know the room is real.
        await upsertPlayer(roomCode, self.clientId, self.displayName, self.isHost);
      }

      const currentQuestionId = existingRoom.currentQuestionId;
      const [initialPlayers, initialAnswers, initialTeams, initialTeamAnswers] = await Promise.all([
        fetchPlayers(roomCode),
        currentQuestionId
          ? fetchAnswers(roomCode, existingRoom.gameInstanceId, currentQuestionId)
          : Promise.resolve([]),
        fetchTeams(roomCode),
        currentQuestionId
          ? fetchTeamAnswers(roomCode, existingRoom.gameInstanceId, currentQuestionId)
          : Promise.resolve([]),
      ]);
      if (cancelled) return;

      setPlayers(initialPlayers);
      setAnswers(initialAnswers);
      setTeams(initialTeams);
      setTeamAnswers(initialTeamAnswers);
      setLoading(false);
    }

    const channel = supabase.channel(`game:${roomCode}`);
    channelRef.current = channel;

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `room_code=eq.${roomCode}` },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!row || Object.keys(row).length === 0) return;
        const updated: RoomRecord = {
          roomCode: row.room_code as string,
          phase: row.phase as RoomRecord["phase"],
          competitionStyle: row.competition_style as CompetitionStyle,
          currentQuestionId: row.current_question_id as string | null,
          gameInstanceId: row.game_instance_id as string,
          winnerIds: (row.winner_ids as string[]) ?? [],
          deckSnapshot: parseRoomDeckSnapshot(row.deck_snapshot),
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
        };

        gameInstanceIdRef.current = updated.gameInstanceId;

        // The room has moved on to a different question (or back to
        // none, in lobby) - last question's answers no longer describe
        // "the current question", so drop them. Nothing needs to be
        // re-fetched: a freshly-started question has no answers yet, and
        // they'll arrive one at a time over this same subscription as
        // competitors submit.
        if (updated.currentQuestionId !== currentQuestionIdRef.current) {
          currentQuestionIdRef.current = updated.currentQuestionId;
          setAnswers([]);
          setTeamAnswers([]);
        }

        setRoom(updated);
      },
    );

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_players", filter: `room_code=eq.${roomCode}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as Record<string, unknown>;
        if (!row) return;
        const clientId = row.client_id as string;

        if (payload.eventType === "DELETE") {
          setPlayers((prev) => prev.filter((player) => player.clientId !== clientId));
          return;
        }

        const updated: PlayerRecord = {
          roomCode: row.room_code as string,
          clientId,
          displayName: row.display_name as string,
          isHost: row.is_host as boolean,
          joinedAt: row.joined_at as string,
          score: row.score as number,
          teamId: row.team_id as string | null,
        };
        setPlayers((prev) => {
          const withoutThisPlayer = prev.filter((player) => player.clientId !== clientId);
          return [...withoutThisPlayer, updated];
        });
      },
    );

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_answers", filter: `room_code=eq.${roomCode}` },
      (payload) => {
        if (payload.eventType === "DELETE") {
          // Play Again clears every answer for the room in one operation;
          // rather than reconcile row-by-row, just drop them all locally.
          setAnswers([]);
          return;
        }

        const row = payload.new as Record<string, unknown>;
        if (!row) return;
        if (!isEventForCurrentInstance(row.game_instance_id as string, gameInstanceIdRef.current)) return;
        if (!isEventForCurrentQuestion(row.question_id as string, currentQuestionIdRef.current)) return;

        const updated: AnswerRecord = {
          roomCode: row.room_code as string,
          gameInstanceId: row.game_instance_id as string,
          questionId: row.question_id as string,
          clientId: row.client_id as string,
          optionId: row.option_id as string | null,
          textAnswer: row.text_answer as string | null,
          gradingStatus: row.grading_status as GradingStatus,
          pointsAwarded: row.points_awarded as number,
          answeredAt: row.answered_at as string,
          reviewedAt: row.reviewed_at as string | null,
        };
        setAnswers((prev) => {
          const withoutThisAnswer = prev.filter((answer) => answer.clientId !== updated.clientId);
          return [...withoutThisAnswer, updated];
        });
      },
    );

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_teams", filter: `room_code=eq.${roomCode}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as Record<string, unknown>;
        if (!row) return;
        const teamId = row.id as string;

        if (payload.eventType === "DELETE") {
          setTeams((prev) => prev.filter((team) => team.id !== teamId));
          return;
        }

        const updated: TeamRecord = {
          id: teamId,
          roomCode: row.room_code as string,
          name: row.name as string,
          createdAt: row.created_at as string,
          score: row.score as number,
        };
        setTeams((prev) => {
          const withoutThisTeam = prev.filter((team) => team.id !== teamId);
          return [...withoutThisTeam, updated];
        });
      },
    );

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_team_answers", filter: `room_code=eq.${roomCode}` },
      (payload) => {
        if (payload.eventType === "DELETE") {
          setTeamAnswers([]);
          return;
        }

        const row = payload.new as Record<string, unknown>;
        if (!row) return;
        if (!isEventForCurrentInstance(row.game_instance_id as string, gameInstanceIdRef.current)) return;
        if (!isEventForCurrentQuestion(row.question_id as string, currentQuestionIdRef.current)) return;

        const updated: TeamAnswerRecord = {
          roomCode: row.room_code as string,
          gameInstanceId: row.game_instance_id as string,
          questionId: row.question_id as string,
          teamId: row.team_id as string,
          optionId: row.option_id as string | null,
          textAnswer: row.text_answer as string | null,
          gradingStatus: row.grading_status as GradingStatus,
          pointsAwarded: row.points_awarded as number,
          answeredAt: row.answered_at as string,
          reviewedAt: row.reviewed_at as string | null,
        };
        setTeamAnswers((prev) => {
          const withoutThisAnswer = prev.filter((answer) => answer.teamId !== updated.teamId);
          return [...withoutThisAnswer, updated];
        });
      },
    );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnectionStatus("connected");
        void bootstrap().catch((error: unknown) => {
          console.error("Failed to load room state:", error);
        });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnectionStatus("disconnected");
      }
    });

    return () => {
      cancelled = true;
      void channel.unsubscribe();
      channelRef.current = null;
    };
    // self's fields are read once per mount to bootstrap; re-running this
    // effect if they change is intentional, not accidental.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, self?.clientId, self?.displayName, self?.isHost]);

  /** Quick Play (deckSnapshot null) uses the hardcoded sample; a Deck-hosted room reads only from its frozen Game Plan. */
  const questionList: Question[] = room?.deckSnapshot?.kind === "game_plan" ? room.deckSnapshot.questions : QUESTIONS;

  const setCompetitionStyle = useCallback(
    async (style: CompetitionStyle) => setCompetitionStyleRow(roomCode, style),
    [roomCode],
  );

  const createTeam = useCallback(
    async (name: string) => {
      const team = await createTeamRow(roomCode, name);
      if (self) {
        await setPlayerTeam(roomCode, self.clientId, team.id);
      }
      return team;
    },
    [roomCode, self],
  );

  const joinTeam = useCallback(
    async (teamId: string) => {
      if (!self) return;
      await setPlayerTeam(roomCode, self.clientId, teamId);
    },
    [roomCode, self],
  );

  const leaveTeam = useCallback(async () => {
    if (!self) return;
    await setPlayerTeam(roomCode, self.clientId, null);
  }, [roomCode, self]);

/**
   * Shared by every Setup-stage patch action below: merges `patch` onto
   * the room's *current* planned_game object and writes it back whole,
   * so no in-flight edit can accidentally drop a sibling field (status,
   * hostParticipation, selectedDeckIds, ...) it wasn't trying to change.
   * Rejects if there's no planned_game to patch - either the room hasn't
   * loaded yet, or its setup is a locked rematch (`kind: "game_plan"`).
   */
  const patchPlannedGame = useCallback(
    async (patch: Partial<PlannedGame>) => {
      if (!room) throw new Error("Room not loaded yet.");
      if (room.deckSnapshot?.kind !== "planned_game") {
        throw new Error("This room's Game Plan is locked from a previous game.");
      }
      const next: PlannedGame = { ...room.deckSnapshot, ...patch };
      await setRoomDeckSnapshot(roomCode, next);
    },
    [roomCode, room],
  );

  /**
   * Persists a live Deck-selection/duration change to rooms.deck_snapshot
   * as a `planned_game` (see hostFlow.buildPlannedGame). Unlike
   * patchPlannedGame, this rebuilds the whole object (a Deck-selection
   * change needs a freshly recomputed planSummary) - so the room's
   * *current* isQuickPlay/status/hostParticipation are explicitly read
   * and passed through, or they'd silently reset to their defaults.
   */
  const updateRoomSetup = useCallback(
    async (selectedDeckIds: string[], targetDurationSeconds: number) => {
      if (!room) throw new Error("Room not loaded yet.");
      if (room.phase !== "lobby") {
        throw new Error("Setup can only change before the game starts.");
      }
      if (room.deckSnapshot?.kind !== "planned_game") {
        throw new Error("This room's Game Plan is locked from a previous game.");
      }
      if (room.deckSnapshot.status !== "setup") {
        throw new Error("Setup can only change during the Game Setup stage.");
      }
      const planned = await buildPlannedGame(selectedDeckIds, targetDurationSeconds, {
        isQuickPlay: room.deckSnapshot.isQuickPlay,
        status: room.deckSnapshot.status,
        hostParticipation: room.deckSnapshot.hostParticipation,
      });
      await setRoomDeckSnapshot(roomCode, planned);
    },
    [roomCode, room],
  );

  const setHostParticipation = useCallback(
    async (value: HostParticipation) => {
      await patchPlannedGame({ hostParticipation: value });
    },
    [patchPlannedGame],
  );

  /**
   * Invite -> Setup. A legacy room from before this restructure (real
   * rooms created before migration 0006 hold `deckSnapshot === null`,
   * the old Quick Play sentinel) is backfilled with a fresh Quick-Play
   * planned_game here rather than left stuck with nothing to advance -
   * `null` historically only ever meant Quick Play, so this is a safe,
   * meaning-preserving default, not a guess.
   */
  const advanceToSetup = useCallback(async () => {
    if (!room) throw new Error("Room not loaded yet.");
    if (room.deckSnapshot === null) {
      const planned = await buildPlannedGame([], GAME_DURATION_MINUTES_DEFAULT * 60, {
        isQuickPlay: true,
        status: "setup",
      });
      await setRoomDeckSnapshot(roomCode, planned);
      return;
    }
    if (room.deckSnapshot.kind !== "planned_game" || room.deckSnapshot.status !== "invite") return;
    await patchPlannedGame({ status: "setup" });
  }, [roomCode, room, patchPlannedGame]);

  /**
   * Setup -> Ready. This is the moment competition style and structural
   * configuration lock (see migration 0006's trigger, which reads this
   * same `status` field) - not Start Game. Revalidates the Deck
   * selection fresh (mirrors the same checks Start Game itself makes)
   * so the Ready Lobby can never show a configuration that's actually
   * broken; Quick Play skips Deck validation entirely, since it has none.
   */
  const confirmSetup = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!room) return { ok: false, error: "Room not loaded yet." };
    if (room.deckSnapshot?.kind !== "planned_game") {
      return { ok: false, error: "This room's Game Plan is locked from a previous game." };
    }
    const snapshot = room.deckSnapshot;

    if (!snapshot.isQuickPlay) {
      if (snapshot.selectedDeckIds.length === 0) {
        return { ok: false, error: "Choose at least one Deck before confirming setup." };
      }
      try {
        const deckInputs: DeckPlanInput[] = await Promise.all(
          snapshot.selectedDeckIds.map(async (deckId) => {
            const deck = await fetchDeck(deckId);
            if (!deck) throw new Error("One of the selected Decks is no longer available.");
            const allQuestions = await fetchDeckQuestions(deckId);
            const readiness = computeDeckReadiness(allQuestions);
            if (!readiness.ready) {
              throw new Error(`"${deck.title}" is no longer ready to host: ${readiness.problems[0]}`);
            }
            return { deckId: deck.id, deckTitle: deck.title, questions: allQuestions };
          }),
        );
        const validation = validateDeckSelection(deckInputs);
        if (!validation.valid) {
          return { ok: false, error: validation.reason };
        }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Couldn't confirm setup. Try again." };
      }
    }

    await patchPlannedGame({ status: "ready" });
    return { ok: true };
  }, [room, patchPlannedGame]);

  /** Ready -> Setup. Not available for a locked rematch (patchPlannedGame rejects when deckSnapshot.kind is "game_plan"). */
  const editSetup = useCallback(async () => {
    await patchPlannedGame({ status: "setup" });
  }, [patchPlannedGame]);

  const lobbyStage = deriveLobbyStage(room?.deckSnapshot ?? null);

  /**
   * Non-null only in Team mode: counts active (non-host) Players with no
   * Team against the *locally held* players list, so the Host UI can
   * disable Start Game and show the exact copy proactively rather than
   * only after a failed attempt. startGame below re-checks this against
   * a fresh fetch immediately before writing, since this local value can
   * be a moment stale relative to the authoritative check that actually
   * gates the transaction.
   */
  const teamReadinessProblem =
    room?.competitionStyle === "team"
      ? (() => {
          const unassignedCount = players.filter((player) => !player.isHost && !player.teamId).length;
          if (unassignedCount === 0) return null;
          return unassignedCount === 1
            ? "1 Player still needs to choose a Team."
            : `${unassignedCount} Players still need to choose a Team.`;
        })()
      : null;

  /**
   * Distinguished entirely by room.deckSnapshot's current shape - Start
   * Game itself never needs to know which case it is ahead of time:
   *  - kind "game_plan": Play Again already happened once in this room
   *    (a rematch) - the frozen plan from the first Start Game is reused
   *    verbatim, only current_question_id resets to its first Question.
   *  - kind "planned_game", isQuickPlay true: Quick Play - there is no
   *    Deck plan to compute or freeze, so deck_snapshot is left exactly
   *    as-is (already `status: "ready"` from Confirm Setup) and only the
   *    phase/current_question_id change.
   *  - kind "planned_game", isQuickPlay false: first Start Game in this
   *    room for a Deck-hosted game - re-fetches every selected Deck's
   *    *current* saved content, revalidates readiness, computes the
   *    Game Plan fresh, and writes it as the new frozen snapshot in the
   *    same atomic update as the phase transition. Never enters the
   *    question phase if any of this fails.
   *  - null: a legacy room from before this restructure - falls back to
   *    the original Quick Play behaviour exactly as it worked before.
   *
   * In every case, `status !== "ready"` is rejected outright: Start Game
   * only ever runs from the Ready Lobby, and this is a defense-in-depth
   * check against a stale Host tab somehow still showing a Start button
   * before Confirm Setup actually happened.
   */
  const startGame = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!room) return { ok: false, error: "Room not loaded yet." };

    if (room.competitionStyle === "team") {
      await cleanupEmptyTeams(roomCode);
      // Re-fetched fresh here (rather than trusting the hook's own
      // `players` state) since this is the authoritative gate that
      // actually decides whether the game may start - it must not act on
      // state that could be a moment stale relative to realtime.
      const freshPlayers = await fetchPlayers(roomCode);
      const unassignedCount = freshPlayers.filter((player) => !player.isHost && !player.teamId).length;
      if (unassignedCount > 0) {
        return {
          ok: false,
          error:
            unassignedCount === 1
              ? "1 Player still needs to choose a Team."
              : `${unassignedCount} Players still need to choose a Team.`,
        };
      }
    }

    const snapshot = room.deckSnapshot;

    if (snapshot?.kind === "game_plan") {
      const ok = await transitionPhase(roomCode, room.phase, "question", {
        current_question_id: snapshot.questions[0]?.id ?? null,
      });
      return ok;
    }

    if (snapshot?.kind === "planned_game") {
      if (snapshot.status !== "ready") {
        return { ok: false, error: "Confirm the game setup before starting." };
      }

      if (snapshot.isQuickPlay) {
        return transitionPhase(roomCode, room.phase, "question", { current_question_id: FIRST_QUESTION_ID });
      }

      if (snapshot.selectedDeckIds.length === 0) {
        return { ok: false, error: "Choose at least one Deck before starting." };
      }

      try {
        const deckInputs: DeckPlanInput[] = await Promise.all(
          snapshot.selectedDeckIds.map(async (deckId) => {
            const deck = await fetchDeck(deckId);
            if (!deck) throw new Error("One of the selected Decks is no longer available.");
            const allQuestions = await fetchDeckQuestions(deckId);
            const readiness = computeDeckReadiness(allQuestions);
            if (!readiness.ready) {
              throw new Error(`"${deck.title}" is no longer ready to host: ${readiness.problems[0]}`);
            }
            return { deckId: deck.id, deckTitle: deck.title, questions: allQuestions };
          }),
        );

        const validation = validateDeckSelection(deckInputs);
        if (!validation.valid) {
          return { ok: false, error: validation.reason };
        }

        const plan = {
          ...computeGamePlan(deckInputs, snapshot.targetDurationSeconds),
          hostParticipation: snapshot.hostParticipation,
        };
        const firstQuestionId = plan.questions[0]?.id ?? null;
        if (!firstQuestionId) {
          return { ok: false, error: "The selected Decks don't contain any Questions yet." };
        }

        const result = await transitionPhase(roomCode, room.phase, "question", {
          current_question_id: firstQuestionId,
          deck_snapshot: plan,
        });

        if (result.ok) {
          void Promise.all(deckInputs.map((deck) => markDeckHosted(deck.deckId))).catch((error: unknown) => {
            console.error("Failed to record last_hosted_at:", error);
          });
        }

        return result;
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Couldn't start the game. Try again." };
      }
    }

    // Legacy room from before this restructure (deckSnapshot null).
    return transitionPhase(roomCode, room.phase, "question", { current_question_id: FIRST_QUESTION_ID });
  }, [roomCode, room]);

  const submitAnswer = useCallback(
    async (optionId: string) => {
      if (!self || !room || room.phase !== "question" || !room.currentQuestionId) return;
      await submitAnswerRow(roomCode, room.gameInstanceId, room.currentQuestionId, self.clientId, optionId);
    },
    [roomCode, room, self],
  );

  const submitTypedAnswer = useCallback(
    async (text: string) => {
      if (!self || !room || room.phase !== "question" || !room.currentQuestionId) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      await submitTypedAnswerRow(roomCode, room.gameInstanceId, room.currentQuestionId, self.clientId, trimmed);
    },
    [roomCode, room, self],
  );

  const myTeamId = self ? (players.find((player) => player.clientId === self.clientId)?.teamId ?? null) : null;

  const submitTeamAnswer = useCallback(
    async (optionId: string) => {
      if (!room || room.phase !== "question" || !room.currentQuestionId || !myTeamId) return;
      await submitTeamAnswerRow(roomCode, room.gameInstanceId, room.currentQuestionId, myTeamId, optionId);
    },
    [roomCode, room, myTeamId],
  );

  const submitTeamTypedAnswer = useCallback(
    async (text: string) => {
      if (!room || room.phase !== "question" || !room.currentQuestionId || !myTeamId) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      await submitTeamTypedAnswerRow(roomCode, room.gameInstanceId, room.currentQuestionId, myTeamId, trimmed);
    },
    [roomCode, room, myTeamId],
  );

  const revealAnswer = useCallback(async () => {
    if (!room || !room.currentQuestionId) return;
    const question = getQuestionById(questionList, room.currentQuestionId);
    if (!question) return;
    await revealAndScore(roomCode, room.gameInstanceId, room.currentQuestionId, room.competitionStyle, question);
  }, [roomCode, room, questionList]);

  const advanceQuestion = useCallback(async () => {
    if (!room) return;
    const nextQuestionId = getNextQuestionId(questionList, room.currentQuestionId);
    if (!nextQuestionId) return;
    await transitionPhase(roomCode, "reveal", "question", { current_question_id: nextQuestionId });
  }, [roomCode, room, questionList]);

  const reviewAnswer = useCallback(
    async (clientId: string, decision: "correct" | "incorrect") => {
      if (!room || !room.currentQuestionId) return;
      const question = getQuestionById(questionList, room.currentQuestionId);
      if (!question) return;
      await reviewAnswerRow(roomCode, room.gameInstanceId, room.currentQuestionId, clientId, decision, question);
    },
    [roomCode, room, questionList],
  );

  const reviewTeamAnswer = useCallback(
    async (teamId: string, decision: "correct" | "incorrect") => {
      if (!room || !room.currentQuestionId) return;
      const question = getQuestionById(questionList, room.currentQuestionId);
      if (!question) return;
      await reviewTeamAnswerRow(roomCode, room.gameInstanceId, room.currentQuestionId, teamId, decision, question);
    },
    [roomCode, room, questionList],
  );

  const showLeaderboard = useCallback(async () => {
    if (!room) return;
    await transitionPhase(roomCode, room.phase, "leaderboard");
  }, [roomCode, room]);

  const showWinner = useCallback(async () => {
    if (!room) return;
    const winnerIds =
      room.competitionStyle === "team"
        ? computeWinners(teams.map(teamToCompetitor)).map((competitor) => competitor.id)
        : computeWinners(
            players.filter((player) => !player.isHost).map(playerToCompetitor),
          ).map((competitor) => competitor.id);

    await transitionPhase(roomCode, room.phase, "ended", { winner_ids: winnerIds });
  }, [roomCode, room, players, teams]);

  /**
   * room.deckSnapshot is never touched here: Play Again in the same
   * room must reuse the exact same frozen Game Plan (or stay null for
   * Quick Play) - only current_question_id/scores/answers reset. The
   * next Start Game sees a `kind: "game_plan"` snapshot already present
   * and reuses it verbatim (see startGame above).
   */
  const playAgain = useCallback(async () => {
    if (!room) return;
    await resetRoomForNewGame(roomCode, room.phase);
  }, [roomCode, room]);

  const myAnswerOptionId = self
    ? (answers.find((answer) => answer.clientId === self.clientId)?.optionId ?? null)
    : null;

  const myTypedAnswerText = self
    ? (answers.find((answer) => answer.clientId === self.clientId)?.textAnswer ?? null)
    : null;

  const myGradingStatus = self
    ? (answers.find((answer) => answer.clientId === self.clientId)?.gradingStatus ?? null)
    : null;

  const myTeamAnswerOptionId = myTeamId
    ? (teamAnswers.find((answer) => answer.teamId === myTeamId)?.optionId ?? null)
    : null;

  const myTeamTypedAnswerText = myTeamId
    ? (teamAnswers.find((answer) => answer.teamId === myTeamId)?.textAnswer ?? null)
    : null;

  const myTeamGradingStatus = myTeamId
    ? (teamAnswers.find((answer) => answer.teamId === myTeamId)?.gradingStatus ?? null)
    : null;

  return {
    connectionStatus,
    loading,
    roomNotFound,
    room,
    players,
    answers,
    teams,
    teamAnswers,
    questionList,
    myAnswerOptionId,
    myTypedAnswerText,
    myGradingStatus,
    myTeamId,
    myTeamAnswerOptionId,
    myTeamTypedAnswerText,
    myTeamGradingStatus,
    teamReadinessProblem,
    lobbyStage,
    setCompetitionStyle,
    createTeam,
    joinTeam,
    leaveTeam,
    updateRoomSetup,
    setHostParticipation,
    advanceToSetup,
    confirmSetup,
    editSetup,
    startGame,
    submitAnswer,
    submitTypedAnswer,
    submitTeamAnswer,
    submitTeamTypedAnswer,
    revealAnswer,
    advanceQuestion,
    reviewAnswer,
    reviewTeamAnswer,
    showLeaderboard,
    showWinner,
    playAgain,
  };
}
