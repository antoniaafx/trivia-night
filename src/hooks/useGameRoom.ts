import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getQuestionById } from "../data/questions";
import { computeWinners } from "../utils/scoring";
import {
  ensureRoomExists,
  fetchAnswers,
  fetchPlayers,
  fetchRoom,
  resetRoomForNewGame,
  revealAndScore,
  submitAnswer as submitAnswerRow,
  transitionPhase,
  upsertPlayer,
} from "../services/gameRoomRepository";
import { isSupabaseConfigured, supabase } from "../services/supabaseClient";
import type { AnswerRecord, PlayerRecord, RoomRecord } from "../types/game";
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
  myAnswerOptionId: string | null;
  startGame: () => Promise<void>;
  submitAnswer: (optionId: string) => Promise<void>;
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

      const [initialPlayers, initialAnswers] = await Promise.all([
        fetchPlayers(roomCode),
        fetchAnswers(roomCode, existingRoom.gameInstanceId),
      ]);
      if (cancelled) return;

      setPlayers(initialPlayers);
      setAnswers(initialAnswers);
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
          currentQuestionId: row.current_question_id as string | null,
          gameInstanceId: row.game_instance_id as string,
          winnerClientIds: (row.winner_client_ids as string[]) ?? [],
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
        if (!row || row.game_instance_id !== gameInstanceIdRef.current) return;

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

  const startGame = useCallback(async () => {
    if (!room) return;
    await transitionPhase(roomCode, room.phase, "question", { current_question_id: "q1" });
  }, [roomCode, room]);

  const submitAnswer = useCallback(
    async (optionId: string) => {
      if (!self || !room || room.phase !== "question") return;
      await submitAnswerRow(roomCode, room.gameInstanceId, self.clientId, optionId);
    },
    [roomCode, room, self],
  );

  const revealAnswer = useCallback(async () => {
    if (!room) return;
    const question = getQuestionById(room.currentQuestionId);
    if (!question) return;
    await revealAndScore(roomCode, room.gameInstanceId, question);
  }, [roomCode, room]);

  const showLeaderboard = useCallback(async () => {
    if (!room) return;
    await transitionPhase(roomCode, room.phase, "leaderboard");
  }, [roomCode, room]);

  const showWinner = useCallback(async () => {
    if (!room) return;
    const scorablePlayers = players.filter((player) => !player.isHost);
    const winnerClientIds = computeWinners(scorablePlayers).map((player) => player.clientId);
    await transitionPhase(roomCode, room.phase, "ended", { winner_client_ids: winnerClientIds });
  }, [roomCode, room, players]);

  const playAgain = useCallback(async () => {
    if (!room) return;
    await resetRoomForNewGame(roomCode, room.phase);
  }, [roomCode, room]);

  const myAnswerOptionId = self
    ? (answers.find((answer) => answer.clientId === self.clientId)?.optionId ?? null)
    : null;

  return {
    connectionStatus,
    loading,
    roomNotFound,
    room,
    players,
    answers,
    myAnswerOptionId,
    startGame,
    submitAnswer,
    revealAnswer,
    showLeaderboard,
    showWinner,
    playAgain,
  };
}
