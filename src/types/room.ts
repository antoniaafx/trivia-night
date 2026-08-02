/**
 * A single connected participant in a room, as tracked by Supabase
 * Realtime Presence. One player is the host; everyone else is a player.
 *
 * This is deliberately ephemeral - it only answers "who is online right
 * now" and is used for the live lobby list. It is not the source of
 * truth for scores or game state; see types/game.ts for that.
 *
 * This intentionally has no "team" concept yet - Competition Style
 * (Team vs Solo) is a later milestone. Every participant here behaves as
 * an individual, which is exactly what Solo mode already is.
 */
export interface RoomPlayer {
  clientId: string;
  displayName: string;
  isHost: boolean;
  joinedAt: number;
}
