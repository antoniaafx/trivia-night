import type { Question } from "../data/questions";
import { scoreForAnswer } from "../utils/scoring";
import { supabase } from "./supabaseClient";
import { isPhaseTransitionAllowed } from "../types/game";
import type {
  AnswerRecord,
  CompetitionStyle,
  PlayerRecord,
  RoomPhase,
  RoomRecord,
  TeamAnswerRecord,
  TeamRecord,
} from "../types/game";

/**
 * All Postgres reads/writes for game state live here, with the raw
 * snake_case rows mapped to the camelCase types the rest of the app
 * uses. Nothing outside this file should know the DB column names.
 */

interface RoomRow {
  room_code: string;
  phase: string;
  competition_style: string;
  current_question_id: string | null;
  game_instance_id: string;
  winner_ids: string[];
  created_at: string;
  updated_at: string;
}

interface PlayerRow {
  room_code: string;
  client_id: string;
  display_name: string;
  is_host: boolean;
  joined_at: string;
  score: number;
  team_id: string | null;
}

interface AnswerRow {
  room_code: string;
  game_instance_id: string;
  client_id: string;
  option_id: string;
  answered_at: string;
}

interface TeamRow {
  id: string;
  room_code: string;
  name: string;
  created_at: string;
  score: number;
}

interface TeamAnswerRow {
  room_code: string;
  game_instance_id: string;
  team_id: string;
  option_id: string;
  answered_at: string;
}

function mapRoomRow(row: RoomRow): RoomRecord {
  return {
    roomCode: row.room_code,
    phase: row.phase as RoomPhase,
    competitionStyle: row.competition_style as CompetitionStyle,
    currentQuestionId: row.current_question_id,
    gameInstanceId: row.game_instance_id,
    winnerIds: row.winner_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlayerRow(row: PlayerRow): PlayerRecord {
  return {
    roomCode: row.room_code,
    clientId: row.client_id,
    displayName: row.display_name,
    isHost: row.is_host,
    joinedAt: row.joined_at,
    score: row.score,
    teamId: row.team_id,
  };
}

function mapAnswerRow(row: AnswerRow): AnswerRecord {
  return {
    roomCode: row.room_code,
    gameInstanceId: row.game_instance_id,
    clientId: row.client_id,
    optionId: row.option_id,
    answeredAt: row.answered_at,
  };
}

function mapTeamRow(row: TeamRow): TeamRecord {
  return {
    id: row.id,
    roomCode: row.room_code,
    name: row.name,
    createdAt: row.created_at,
    score: row.score,
  };
}

function mapTeamAnswerRow(row: TeamAnswerRow): TeamAnswerRecord {
  return {
    roomCode: row.room_code,
    gameInstanceId: row.game_instance_id,
    teamId: row.team_id,
    optionId: row.option_id,
    answeredAt: row.answered_at,
  };
}

export async function fetchRoom(roomCode: string): Promise<RoomRecord | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRoomRow(data as RoomRow) : null;
}

export async function fetchPlayers(roomCode: string): Promise<PlayerRecord[]> {
  const { data, error } = await supabase.from("room_players").select("*").eq("room_code", roomCode);

  if (error) throw error;
  return (data ?? []).map((row) => mapPlayerRow(row as PlayerRow));
}

export async function fetchAnswers(roomCode: string, gameInstanceId: string): Promise<AnswerRecord[]> {
  const { data, error } = await supabase
    .from("room_answers")
    .select("*")
    .eq("room_code", roomCode)
    .eq("game_instance_id", gameInstanceId);

  if (error) throw error;
  return (data ?? []).map((row) => mapAnswerRow(row as AnswerRow));
}

export async function fetchTeams(roomCode: string): Promise<TeamRecord[]> {
  const { data, error } = await supabase.from("room_teams").select("*").eq("room_code", roomCode);

  if (error) throw error;
  return (data ?? []).map((row) => mapTeamRow(row as TeamRow));
}

export async function fetchTeamAnswers(roomCode: string, gameInstanceId: string): Promise<TeamAnswerRecord[]> {
  const { data, error } = await supabase
    .from("room_team_answers")
    .select("*")
    .eq("room_code", roomCode)
    .eq("game_instance_id", gameInstanceId);

  if (error) throw error;
  return (data ?? []).map((row) => mapTeamAnswerRow(row as TeamAnswerRow));
}

/** Insert-if-missing. A host refreshing mid-game must never reset an existing room. */
export async function ensureRoomExists(roomCode: string): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .upsert({ room_code: roomCode }, { onConflict: "room_code", ignoreDuplicates: true });

  if (error) throw error;
}

/**
 * Sets competition_style. Rejected by the database trigger once a
 * non-host player has joined - this is caught here (Postgres error code
 * P0001, a plain `raise exception`) and turned into `{ ok: false }`
 * rather than a thrown error, so the UI can show calm helper copy
 * instead of an error state for what is an expected, common outcome.
 */
export async function setCompetitionStyle(
  roomCode: string,
  style: CompetitionStyle,
): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from("rooms")
    .update({ competition_style: style, updated_at: new Date().toISOString() })
    .eq("room_code", roomCode);

  if (error) {
    if (error.code === "P0001") {
      return { ok: false };
    }
    throw error;
  }
  return { ok: true };
}

/**
 * Upsert without a `score`/`team_id` field only ever touches
 * display_name/is_host on conflict (PostgREST's upsert updates exactly
 * the columns present in the payload) - a reconnecting player's score,
 * team, and original joined_at are left untouched.
 */
export async function upsertPlayer(
  roomCode: string,
  clientId: string,
  displayName: string,
  isHost: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("room_players")
    .upsert(
      { room_code: roomCode, client_id: clientId, display_name: displayName, is_host: isHost },
      { onConflict: "room_code,client_id" },
    );

  if (error) throw error;
}

/** Creates a team, or rejects a normalized-duplicate name with a friendly message (never the raw Postgres text). */
export async function createTeam(roomCode: string, name: string): Promise<TeamRecord> {
  const { data, error } = await supabase
    .from("room_teams")
    .insert({ room_code: roomCode, name: name.trim() })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("That team name is already being used in this room.");
    }
    throw error;
  }

  return mapTeamRow(data as TeamRow);
}

/** Join, switch, or (passing null) leave a team. A single-row update is already atomic - no separate "leave" step is needed first. */
export async function setPlayerTeam(roomCode: string, clientId: string, teamId: string | null): Promise<void> {
  const { error } = await supabase
    .from("room_players")
    .update({ team_id: teamId })
    .eq("room_code", roomCode)
    .eq("client_id", clientId);

  if (error) throw error;
}

/** Removes any team nobody currently belongs to. Safe to call any time before the game starts. */
export async function cleanupEmptyTeams(roomCode: string): Promise<void> {
  const [teams, players] = await Promise.all([fetchTeams(roomCode), fetchPlayers(roomCode)]);
  const referencedTeamIds = new Set(
    players.map((player) => player.teamId).filter((teamId): teamId is string => teamId !== null),
  );
  const emptyTeamIds = teams.filter((team) => !referencedTeamIds.has(team.id)).map((team) => team.id);
  if (emptyTeamIds.length === 0) return;

  const { error } = await supabase.from("room_teams").delete().in("id", emptyTeamIds);
  if (error) throw error;
}

/** Change/record a player's answer. Same primary key on every call, so duplicate taps never duplicate rows. */
export async function submitAnswer(
  roomCode: string,
  gameInstanceId: string,
  clientId: string,
  optionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("room_answers")
    .upsert(
      { room_code: roomCode, game_instance_id: gameInstanceId, client_id: clientId, option_id: optionId },
      { onConflict: "room_code,game_instance_id,client_id" },
    );

  if (error) throw error;
}

/**
 * Change/record a team's shared answer. Same primary key regardless of
 * which teammate taps, so two teammates tapping different options at
 * nearly the same instant both upsert the *same* row - Postgres
 * serializes the two writes, and whichever commits last is
 * deterministically the team's answer. Every client reconciles to that
 * one row via the realtime subscription; no client-side timestamp
 * comparison is involved.
 */
export async function submitTeamAnswer(
  roomCode: string,
  gameInstanceId: string,
  teamId: string,
  optionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("room_team_answers")
    .upsert(
      { room_code: roomCode, game_instance_id: gameInstanceId, team_id: teamId, option_id: optionId },
      { onConflict: "room_code,game_instance_id,team_id" },
    );

  if (error) throw error;
}

async function setPlayerScore(roomCode: string, clientId: string, score: number): Promise<void> {
  const { error } = await supabase
    .from("room_players")
    .update({ score })
    .eq("room_code", roomCode)
    .eq("client_id", clientId);

  if (error) throw error;
}

async function setTeamScore(roomCode: string, teamId: string, score: number): Promise<void> {
  const { error } = await supabase.from("room_teams").update({ score }).eq("room_code", roomCode).eq("id", teamId);

  if (error) throw error;
}

async function resetPlayerScores(roomCode: string): Promise<void> {
  const { error } = await supabase.from("room_players").update({ score: 0 }).eq("room_code", roomCode);

  if (error) throw error;
}

async function resetTeamScores(roomCode: string): Promise<void> {
  const { error } = await supabase.from("room_teams").update({ score: 0 }).eq("room_code", roomCode);

  if (error) throw error;
}

async function deleteAnswersForRoom(roomCode: string): Promise<void> {
  const { error } = await supabase.from("room_answers").delete().eq("room_code", roomCode);

  if (error) throw error;
}

async function deleteTeamAnswersForRoom(roomCode: string): Promise<void> {
  const { error } = await supabase.from("room_team_answers").delete().eq("room_code", roomCode);

  if (error) throw error;
}

/**
 * The only way the app ever changes `phase`. Refuses anything not in
 * ALLOWED_PHASE_TRANSITIONS, and the `.eq("phase", fromPhase)` clause is
 * an optimistic-concurrency check: if the phase already moved on by the
 * time this write lands, the update matches zero rows (`ok: false`)
 * instead of clobbering newer state with a stale transition.
 */
export async function transitionPhase(
  roomCode: string,
  fromPhase: RoomPhase,
  toPhase: RoomPhase,
  extraFields: Partial<{
    current_question_id: string | null;
    game_instance_id: string;
    winner_ids: string[];
  }> = {},
): Promise<{ ok: boolean }> {
  if (!isPhaseTransitionAllowed(fromPhase, toPhase)) {
    throw new Error(`Invalid phase transition: ${fromPhase} -> ${toPhase}`);
  }

  const { data, error } = await supabase
    .from("rooms")
    .update({ phase: toPhase, ...extraFields, updated_at: new Date().toISOString() })
    .eq("room_code", roomCode)
    .eq("phase", fromPhase)
    .select();

  if (error) throw error;
  return { ok: (data?.length ?? 0) > 0 };
}

/**
 * Reveal is the one moment scoring happens: computed once, from the
 * authoritative answers at that instant, and written before the phase
 * flips - so by the time any client sees "reveal" over realtime, scores
 * are already correct. A late-arriving answer write after this point
 * simply isn't read by anything anymore; it cannot retroactively change
 * a score that's already been computed.
 *
 * Branches on competitionStyle: Solo grades each player once; Team
 * grades each team once, regardless of how many members it has - the
 * team's shared answer is graded exactly one time, never per member.
 */
export async function revealAndScore(
  roomCode: string,
  gameInstanceId: string,
  competitionStyle: CompetitionStyle,
  question: Question,
): Promise<{ ok: boolean }> {
  if (competitionStyle === "team") {
    const [teams, teamAnswers] = await Promise.all([
      fetchTeams(roomCode),
      fetchTeamAnswers(roomCode, gameInstanceId),
    ]);
    const optionByTeamId = new Map(teamAnswers.map((answer) => [answer.teamId, answer.optionId]));

    await Promise.all(
      teams.map((team) => setTeamScore(roomCode, team.id, scoreForAnswer(optionByTeamId.get(team.id), question))),
    );
  } else {
    const [players, answers] = await Promise.all([
      fetchPlayers(roomCode),
      fetchAnswers(roomCode, gameInstanceId),
    ]);
    const optionByClientId = new Map(answers.map((answer) => [answer.clientId, answer.optionId]));

    await Promise.all(
      players
        .filter((player) => !player.isHost)
        .map((player) =>
          setPlayerScore(roomCode, player.clientId, scoreForAnswer(optionByClientId.get(player.clientId), question)),
        ),
    );
  }

  return transitionPhase(roomCode, "question", "reveal");
}

/**
 * Play Again: wipes prior answers and scores (both Solo and Team tables
 * - harmless no-ops for whichever mode isn't in use, since those tables
 * are simply empty), then moves back to lobby under a brand-new
 * game_instance_id. Not wrapped in a single DB transaction (no RPC in
 * this milestone) - acceptable since this is a single-host-triggered,
 * low-frequency reset with no concurrent writers. Teams and player
 * memberships are deliberately left untouched.
 */
export async function resetRoomForNewGame(
  roomCode: string,
  fromPhase: RoomPhase,
): Promise<{ ok: boolean }> {
  await Promise.all([deleteAnswersForRoom(roomCode), deleteTeamAnswersForRoom(roomCode)]);
  await Promise.all([resetPlayerScores(roomCode), resetTeamScores(roomCode)]);

  return transitionPhase(roomCode, fromPhase, "lobby", {
    current_question_id: null,
    game_instance_id: crypto.randomUUID(),
    winner_ids: [],
  });
}
