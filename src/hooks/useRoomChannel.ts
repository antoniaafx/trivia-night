import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../services/supabaseClient";
import type { RoomPhase, RoomPlayer } from "../types/room";

interface UseRoomChannelOptions {
  roomCode: string;
  self: RoomPlayer;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface UseRoomChannelResult {
  players: RoomPlayer[];
  phase: RoomPhase;
  connectionStatus: ConnectionStatus;
  broadcastPhaseChange: (phase: RoomPhase) => void;
}

/**
 * Wraps a Supabase Realtime channel scoped to one room code.
 *
 * Deliberately has no database table backing it yet. A room's entire
 * live state - who's connected, and the current phase - is carried by
 * the realtime channel itself (Presence for participants, Broadcast for
 * host-triggered events). This is enough for the lobby and works today
 * with nothing more than a Supabase project's URL/anon key - no schema,
 * no migration.
 *
 * TODO: once game state needs to survive every participant disconnecting
 * (current question, scores, room settings), introduce a `rooms` table
 * and read/write through it instead of relying on presence alone.
 */
export function useRoomChannel({ roomCode, self }: UseRoomChannelOptions): UseRoomChannelResult {
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [phase, setPhase] = useState<RoomPhase>("lobby");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    setConnectionStatus("connecting");

    const channel = supabase.channel(`room:${roomCode}`, {
      config: { presence: { key: self.clientId } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<RoomPlayer>();
      const connected = Object.values(state)
        .flat()
        .sort((a, b) => {
          if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
          return a.joinedAt - b.joinedAt;
        });
      setPlayers(connected);
    });

    channel.on("broadcast", { event: "phase_change" }, ({ payload }) => {
      setPhase(payload.phase as RoomPhase);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track(self);
        setConnectionStatus("connected");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnectionStatus("disconnected");
      }
    });

    return () => {
      void channel.unsubscribe();
      channelRef.current = null;
    };
    // self is a small, effectively-constant identity object per mount;
    // re-subscribing when its fields change is correct, not accidental.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, self.clientId, self.displayName, self.isHost]);

  const broadcastPhaseChange = useCallback((newPhase: RoomPhase) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "phase_change",
      payload: { phase: newPhase },
    });
    setPhase(newPhase);
  }, []);

  return { players, phase, connectionStatus, broadcastPhaseChange };
}
