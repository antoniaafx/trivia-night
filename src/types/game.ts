/**
 * Authoritative game-state types, backed by Postgres (see
 * supabase/migrations/0001_game_state.sql and 0002_team_mode.sql), not
 * by Presence/Broadcast. Presence still tracks "who's online right now"
 * for the lobby; these types describe the durable state that must
 * survive a refresh.
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

export type CompetitionStyle = "solo" | "team";

/** The authoritative `rooms` row. */
export interface RoomRecord {
  roomCode: string;
  phase: RoomPhase;
  competitionStyle: CompetitionStyle;
  currentQuestionId: string | null;
  gameInstanceId: string;
  /** Holds team ids in Team Mode, player client ids in Solo Mode. */
  winnerIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * A durable roster entry with a running score. Distinct from RoomPlayer
 * (types/room.ts): that one is ephemeral Presence metadata; this one is
 * a Postgres row that survives a disconnect or refresh.
 *
 * `score` is only meaningful in Solo Mode. In Team Mode a player's own
 * score always stays 0 - their team's score (on TeamRecord) is what
 * counts, and is what the leaderboard reads.
 */
export interface PlayerRecord {
  roomCode: string;
  clientId: string;
  displayName: string;
  isHost: boolean;
  joinedAt: string;
  score: number;
  /** Null in Solo Mode, and always null for the host. */
  teamId: string | null;
}

/** One row per player per game instance - Solo Mode only. */
export interface AnswerRecord {
  roomCode: string;
  gameInstanceId: string;
  clientId: string;
  optionId: string;
  answeredAt: string;
}

/** A room_teams row - Team Mode only. */
export interface TeamRecord {
  id: string;
  roomCode: string;
  name: string;
  createdAt: string;
  score: number;
}

/** One row per team per game instance - Team Mode only. Same shape and upsert semantics as AnswerRecord. */
export interface TeamAnswerRecord {
  roomCode: string;
  gameInstanceId: string;
  teamId: string;
  optionId: string;
  answeredAt: string;
}

/**
 * The shared shape scoring, ranking, tie-breaking, and winner selection
 * all operate on - regardless of whether it was built from a Player or
 * a Team. This is what "avoid duplicated logic" means in practice: one
 * set of functions (utils/scoring.ts) works for both, fed through the
 * mappers below.
 *
 * Never rendered directly with generic wording - callers choose
 * "Player" or "Team" labels themselves; this type has no opinion on
 * user-facing language.
 */
export interface Competitor {
  id: string;
  displayName: string;
  score: number;
  /** Used only for deterministic tie-breaking - joinedAt for a player, createdAt for a team. */
  tiebreakAt: string;
}

export function playerToCompetitor(player: PlayerRecord): Competitor {
  return {
    id: player.clientId,
    displayName: player.displayName,
    score: player.score,
    tiebreakAt: player.joinedAt,
  };
}

export function teamToCompetitor(team: TeamRecord): Competitor {
  return {
    id: team.id,
    displayName: team.name,
    score: team.score,
    tiebreakAt: team.createdAt,
  };
}
