/**
 * Authoritative game-state types, backed by Postgres (see
 * supabase/migrations/0001_game_state.sql), not by Presence/Broadcast.
 * Presence still tracks "who's online right now" for the lobby; these
 * types describe the durable state that must survive a refresh.
 */
export type RoomPhase = "lobby" | "question" | "reveal" | "leaderboard" | "ended";

/**
 * The only phase transitions the app will ever perform. Anything not
 * listed here is refused by requestPhaseTransition() in
 * services/gameRoomRepository.ts - this table is the single place that
 * decision is made, not scattered across components.
 */
export const ALLOWED_PHASE_TRANSITIONS: Record<RoomPhase, RoomPhase[]> = {
  lobby: ["question"],
  question: ["reveal"],
  reveal: ["leaderboard"],
  leaderboard: ["ended"],
  ended: ["lobby"], // Play Again
};

export function isPhaseTransitionAllowed(from: RoomPhase, to: RoomPhase): boolean {
  return ALLOWED_PHASE_TRANSITIONS[from].includes(to);
}

/** The authoritative `rooms` row. */
export interface RoomRecord {
  roomCode: string;
  phase: RoomPhase;
  currentQuestionId: string | null;
  gameInstanceId: string;
  winnerClientIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * A durable roster entry with a running score. Distinct from RoomPlayer
 * (types/room.ts): that one is ephemeral Presence metadata; this one is
 * a Postgres row that survives a disconnect or refresh.
 */
export interface PlayerRecord {
  roomCode: string;
  clientId: string;
  displayName: string;
  isHost: boolean;
  joinedAt: string;
  score: number;
}

/** One row per player per game instance - see room_answers in the migration. */
export interface AnswerRecord {
  roomCode: string;
  gameInstanceId: string;
  clientId: string;
  optionId: string;
  answeredAt: string;
}
