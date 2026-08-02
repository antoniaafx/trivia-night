/**
 * Room phases. Only "lobby" and "active" are used in this milestone.
 * The remaining values are declared now so later milestones (reveal,
 * leaderboard, game end) don't require reshaping this type or any code
 * that switches on it.
 */
export type RoomPhase = "lobby" | "active" | "reveal" | "leaderboard" | "ended";

/**
 * A single connected participant in a room, as tracked by Supabase
 * Realtime Presence. One player is the host; everyone else is a player.
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
