import type { Question } from "../data/questions";
import { scoreForAnswer } from "../utils/scoring";
import { supabase } from "./supabaseClient";
import { isPhaseTransitionAllowed } from "../types/game";
import type { AnswerRecord, PlayerRecord, RoomPhase, RoomRecord } from "../types/game";

/**
 * All Postgres reads/writes for game state live here, with the raw
 * snake_case rows mapped to the camelCase types the rest of the app
 * uses. Nothing outside this file should know the DB column names.
 */

interface RoomRow {
  room_code: string;
  phase: string;
  current_question_id: string | null;
  game_instance_id: string;
  winner_client_ids: string[];
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
}

interface AnswerRow {
  room_code: string;
  game_instance_id: string;
  client_id: string;
  option_id: string;
  answered_at: string;
}

function mapRoomRow(row: RoomRow): RoomRecord {
  return {
    roomCode: row.room_code,
    phase: row.phase as RoomPhase,
    currentQuestionId: row.current_question_id,
    gameInstanceId: row.game_instance_id,
    winnerClientIds: row.winner_client_ids ?? [],
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

/** Insert-if-missing. A host refreshing mid-game must never reset an existing room. */
export async function ensureRoomExists(roomCode: string): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .upsert({ room_code: roomCode }, { onConflict: "room_code", ignoreDuplicates: true });

  if (error) throw error;
}

/**
 * Upsert without a `score` field only ever touches display_name/is_host
 * on conflict (PostgREST's upsert updates exactly the columns present in
 * the payload) - a reconnecting player's score and original joined_at
 * are left untouched.
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

async function setPlayerScore(roomCode: string, clientId: string, score: number): Promise<void> {
  const { error } = await supabase
    .from("room_players")
    .update({ score })
    .eq("room_code", roomCode)
    .eq("client_id", clientId);

  if (error) throw error;
}

async function resetPlayerScores(roomCode: string): Promise<void> {
  const { error } = await supabase.from("room_players").update({ score: 0 }).eq("room_code", roomCode);

  if (error) throw error;
}

async function deleteAnswersForRoom(roomCode: string): Promise<void> {
  const { error } = await supabase.from("room_answers").delete().eq("room_code", roomCode);

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
    winner_client_ids: string[];
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
 */
export async function revealAndScore(
  roomCode: string,
  gameInstanceId: string,
  question: Question,
): Promise<{ ok: boolean }> {
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

  return transitionPhase(roomCode, "question", "reveal");
}

/**
 * Play Again: wipes prior answers and scores, then moves back to lobby
 * under a brand-new game_instance_id. Not wrapped in a single DB
 * transaction (no RPC in this milestone) - acceptable since this is a
 * single-host-triggered, low-frequency reset with no concurrent writers.
 */
export async function resetRoomForNewGame(
  roomCode: string,
  fromPhase: RoomPhase,
): Promise<{ ok: boolean }> {
  await deleteAnswersForRoom(roomCode);
  await resetPlayerScores(roomCode);

  return transitionPhase(roomCode, fromPhase, "lobby", {
    current_question_id: null,
    game_instance_id: crypto.randomUUID(),
    winner_client_ids: [],
  });
}
