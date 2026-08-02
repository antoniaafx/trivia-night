import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../services/supabaseClient";
import type { RoomPlayer } from "../types/room";

interface UseRoomChannelOptions {
  roomCode: string;
  self: RoomPlayer;
}

// "unconfigured" is distinct from "connecting": it means no connection
// attempt was ever made, because there's nothing valid to connect to.
// Without this, a missing .env.local would just look like an indefinite
// spinner instead of a clear, actionable state.
export type ConnectionStatus = "unconfigured" | "connecting" | "connected" | "disconnected";

interface UseRoomChannelResult {
  players: RoomPlayer[];
  connectionStatus: ConnectionStatus;
}

/**
 * Presence only - "who is connected to this room right now", for the
 * live lobby list. This is exactly what it was in Milestone 1.
 *
 * Game phase, answers, and scores no longer live here - Broadcast
 * messages are never replayed to a client that reconnects or refreshes,
 * so they can't be the source of truth for anything that must survive a
 * refresh. That authoritative state now lives in Postgres; see
 * useGameRoom and services/gameRoomRepository.ts.
 */
export function useRoomChannel({ roomCode, self }: UseRoomChannelOptions): UseRoomChannelResult {
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    isSupabaseConfigured ? "connecting" : "unconfigured",
  );

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setConnectionStatus("unconfigured");
      return;
    }

    setConnectionStatus("connecting");

    const channel = supabase.channel(`presence:${roomCode}`, {
      config: { presence: { key: self.clientId } },
    });

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
    };
    // self is a small, effectively-constant identity object per mount;
    // re-subscribing when its fields change is correct, not accidental.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, self.clientId, self.displayName, self.isHost]);

  return { players, connectionStatus };
}
