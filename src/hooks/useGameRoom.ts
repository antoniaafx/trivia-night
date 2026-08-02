import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getQuestionById } from "../data/questions";
import { computeWinners, isEventForCurrentInstance } from "../utils/scoring";
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
  setCompetitionStyle as setCompetitionStyleRow,
  setPlayerTeam,
  submitAnswer as submitAnswerRow,
  submitTeamAnswer as submitTeamAnswerRow,
  transitionPhase,
  upsertPlayer,
} from "../services/gameRoomRepository";
import { isSupabaseConfigured, supabase } from "../services/supabaseClient";
import { playerToCompetitor, teamToCompetitor } from "../types/game";
import type {
  AnswerRecord,
  CompetitionStyle,
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
  answers: AnswerRecord[];
  teams: TeamRecord[];
  teamAnswers: TeamAnswerRecord[];
  myAnswerOptionId: string | null;
  myTeamId: string | null;
  myTeamAnswerOptionId: string | null;
  setCompetitionStyle: (style: CompetitionStyle) => Promise<{ ok: boolean }>;
  createTeam: (name: string) => Promise<TeamRecord>;
  joinTeam: (teamId: string) => Promise<void>;
  leaveTeam: () => Promise<void>;
  startGame: () => Promise<void>;
  submitAnswer: (optionId: string) => Promise<void>;
  submitTeamAnswer: (optionId: string) => Promise<void>;
  revealAnswer: () => Promise<void>;
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
  // incoming events against the *latest* game instance id, not whatever
  // was current when the subscription was created - a ref avoids stale
  // closures without re-subscribing on every room update.
  const gameInstanceIdRef = useRef<string | null>(null);
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
      setRoom(existingRoom);

      if (self) {
        // A room_players row requires an existing room (foreign key), so
        // this only ever runs once we know the room is real.
        await upsertPlayer(roomCode, self.clientId, self.displayName, self.isHost);
      }

      const [initialPlayers, initialAnswers, initialTeams, initialTeamAnswers] = await Promise.all([
        fetchPlayers(roomCode),
        fetchAnswers(roomCode, existingRoom.gameInstanceId),
        fetchTeams(roomCode),
        fetchTeamAnswers(roomCode, existingRoom.gameInstanceId),
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
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
        };
        gameInstanceIdRef.current = updated.gameInstanceId;
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
        if (!row || !isEventForCurrentInstance(row.game_instance_id as string, gameInstanceIdRef.current)) return;

        const updated: AnswerRecord = {
          roomCode: row.room_code as string,
          gameInstanceId: row.game_instance_id as string,
          clientId: row.client_id as string,
          optionId: row.option_id as string,
          answeredAt: row.answered_at as string,
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
        if (!row || !isEventForCurrentInstance(row.game_instance_id as string, gameInstanceIdRef.current)) return;

        const updated: TeamAnswerRecord = {
          roomCode: row.room_code as string,
          gameInstanceId: row.game_instance_id as string,
          teamId: row.team_id as string,
          optionId: row.option_id as string,
          answeredAt: row.answered_at as string,
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

  const startGame = useCallback(async () => {
    if (!room) return;
    if (room.competitionStyle === "team") {
      await cleanupEmptyTeams(roomCode);
    }
    await transitionPhase(roomCode, room.phase, "question", { current_question_id: "q1" });
  }, [roomCode, room]);

  const submitAnswer = useCallback(
    async (optionId: string) => {
      if (!self || !room || room.phase !== "question") return;
      await submitAnswerRow(roomCode, room.gameInstanceId, self.clientId, optionId);
    },
    [roomCode, room, self],
  );

  const myTeamId = self ? (players.find((player) => player.clientId === self.clientId)?.teamId ?? null) : null;

  const submitTeamAnswer = useCallback(
    async (optionId: string) => {
      if (!room || room.phase !== "question" || !myTeamId) return;
      await submitTeamAnswerRow(roomCode, room.gameInstanceId, myTeamId, optionId);
    },
    [roomCode, room, myTeamId],
  );

  const revealAnswer = useCallback(async () => {
    if (!room) return;
    const question = getQuestionById(room.currentQuestionId);
    if (!question) return;
    await revealAndScore(roomCode, room.gameInstanceId, room.competitionStyle, question);
  }, [roomCode, room]);

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

  const playAgain = useCallback(async () => {
    if (!room) return;
    await resetRoomForNewGame(roomCode, room.phase);
  }, [roomCode, room]);

  const myAnswerOptionId = self
    ? (answers.find((answer) => answer.clientId === self.clientId)?.optionId ?? null)
    : null;

  const myTeamAnswerOptionId = myTeamId
    ? (teamAnswers.find((answer) => answer.teamId === myTeamId)?.optionId ?? null)
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
    myAnswerOptionId,
    myTeamId,
    myTeamAnswerOptionId,
    setCompetitionStyle,
    createTeam,
    joinTeam,
    leaveTeam,
    startGame,
    submitAnswer,
    submitTeamAnswer,
    revealAnswer,
    showLeaderboard,
    showWinner,
    playAgain,
  };
}
