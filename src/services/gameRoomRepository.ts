import type { Question } from "../data/questions";
import { gradeSubmission, pointsForGrade, sumPointsAwarded } from "../utils/scoring";
import { parseRoomDeckSnapshot } from "../utils/gamePlan";
import type { RoomDeckSnapshot } from "../utils/gamePlan";
import { supabase } from "./supabaseClient";
import { isPhaseTransitionAllowed } from "../types/game";
import type {
  AnswerRecord,
  CompetitionStyle,
  GradingStatus,
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
  deck_snapshot: unknown;
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
  question_id: string;
  client_id: string;
  option_id: string | null;
  text_answer: string | null;
  grading_status: string;
  points_awarded: number;
  answered_at: string;
  reviewed_at: string | null;
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
  question_id: string;
  team_id: string;
  option_id: string | null;
  text_answer: string | null;
  grading_status: string;
  points_awarded: number;
  answered_at: string;
  reviewed_at: string | null;
}

function mapRoomRow(row: RoomRow): RoomRecord {
  return {
    roomCode: row.room_code,
    phase: row.phase as RoomPhase,
    competitionStyle: row.competition_style as CompetitionStyle,
    currentQuestionId: row.current_question_id,
    gameInstanceId: row.game_instance_id,
    winnerIds: row.winner_ids ?? [],
    deckSnapshot: parseRoomDeckSnapshot(row.deck_snapshot),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Builds a RoomRecord from a Realtime `postgres_changes` payload row -
 * used instead of mapRoomRow specifically because this row did not come
 * from a plain SELECT. A large TOASTed column an UPDATE left unchanged
 * - `deck_snapshot` is exactly this once a real multi-Deck Game Plan is
 * loaded - can be omitted from the WAL entry entirely by Postgres's
 * logical replication (which postgres_changes rides on) when the
 * table's REPLICA IDENTITY is DEFAULT, so the key can be legitimately
 * *absent* from `row` even though the room still has a perfectly valid
 * snapshot. Reveal is the clearest example: it only ever changes
 * `phase`. Migration 0008 sets REPLICA IDENTITY FULL specifically to
 * stop this at the source; this function is the client-side half of
 * the same fix, kept as defense-in-depth for any Supabase project that
 * hasn't run 0008, or any future column with the same TOAST potential.
 * A key that's *present* with an explicit `null` value (a legacy
 * pre-Deck-system room, or a fresh room before Start Game) is trusted
 * and applied; only a genuinely missing key falls back to the
 * previously known snapshot instead of wiping it out.
 */
export function mapRealtimeRoomRow(row: Record<string, unknown>, previous: RoomRecord | null): RoomRecord {
  return {
    roomCode: row.room_code as string,
    phase: row.phase as RoomPhase,
    competitionStyle: row.competition_style as CompetitionStyle,
    currentQuestionId: row.current_question_id as string | null,
    gameInstanceId: row.game_instance_id as string,
    winnerIds: (row.winner_ids as string[] | undefined) ?? [],
    deckSnapshot:
      "deck_snapshot" in row ? parseRoomDeckSnapshot(row.deck_snapshot) : (previous?.deckSnapshot ?? null),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
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
    questionId: row.question_id,
    clientId: row.client_id,
    optionId: row.option_id,
    textAnswer: row.text_answer,
    gradingStatus: row.grading_status as GradingStatus,
    pointsAwarded: row.points_awarded,
    answeredAt: row.answered_at,
    reviewedAt: row.reviewed_at,
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
    questionId: row.question_id,
    teamId: row.team_id,
    optionId: row.option_id,
    textAnswer: row.text_answer,
    gradingStatus: row.grading_status as GradingStatus,
    pointsAwarded: row.points_awarded,
    answeredAt: row.answered_at,
    reviewedAt: row.reviewed_at,
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

/** Omitting questionId returns every question's answers for this instance - used for total-score reconciliation. */
export async function fetchAnswers(
  roomCode: string,
  gameInstanceId: string,
  questionId?: string,
): Promise<AnswerRecord[]> {
  let query = supabase
    .from("room_answers")
    .select("*")
    .eq("room_code", roomCode)
    .eq("game_instance_id", gameInstanceId);
  if (questionId !== undefined) {
    query = query.eq("question_id", questionId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapAnswerRow(row as AnswerRow));
}

export async function fetchTeams(roomCode: string): Promise<TeamRecord[]> {
  const { data, error } = await supabase.from("room_teams").select("*").eq("room_code", roomCode);

  if (error) throw error;
  return (data ?? []).map((row) => mapTeamRow(row as TeamRow));
}

/** Omitting questionId returns every question's answers for this instance - used for total-score reconciliation. */
export async function fetchTeamAnswers(
  roomCode: string,
  gameInstanceId: string,
  questionId?: string,
): Promise<TeamAnswerRecord[]> {
  let query = supabase
    .from("room_team_answers")
    .select("*")
    .eq("room_code", roomCode)
    .eq("game_instance_id", gameInstanceId);
  if (questionId !== undefined) {
    query = query.eq("question_id", questionId);
  }

  const { data, error } = await query;
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
 * Writes the Host's Deck/duration choices as a `kind: "setup"` object
 * (see utils/gamePlan.ts) as soon as Game Setup creates the room - a
 * plain update, not a phase transition, since the room stays in lobby.
 * This is what makes a Lobby refresh before Start Game safe: the
 * choices live in the room row itself, not only in this tab's memory.
 * Start Game later replaces this with the frozen game_plan snapshot.
 */
export async function setRoomDeckSnapshot(roomCode: string, snapshot: RoomDeckSnapshot): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .update({ deck_snapshot: snapshot, updated_at: new Date().toISOString() })
    .eq("room_code", roomCode);

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

/** Change/record a player's Multiple Choice answer. Same primary key on every call, so duplicate taps never duplicate rows. */
export async function submitAnswer(
  roomCode: string,
  gameInstanceId: string,
  questionId: string,
  clientId: string,
  optionId: string,
): Promise<void> {
  const { error } = await supabase.from("room_answers").upsert(
    {
      room_code: roomCode,
      game_instance_id: gameInstanceId,
      question_id: questionId,
      client_id: clientId,
      option_id: optionId,
    },
    { onConflict: "room_code,game_instance_id,question_id,client_id" },
  );

  if (error) throw error;
}

/** Change/record a player's Typed Answer submission. The original text is preserved verbatim; grading happens later, at Reveal. */
export async function submitTypedAnswer(
  roomCode: string,
  gameInstanceId: string,
  questionId: string,
  clientId: string,
  textAnswer: string,
): Promise<void> {
  const { error } = await supabase.from("room_answers").upsert(
    {
      room_code: roomCode,
      game_instance_id: gameInstanceId,
      question_id: questionId,
      client_id: clientId,
      text_answer: textAnswer,
    },
    { onConflict: "room_code,game_instance_id,question_id,client_id" },
  );

  if (error) throw error;
}

/**
 * Change/record a team's shared Multiple Choice answer. Same primary
 * key regardless of which teammate taps, so two teammates tapping
 * different options at nearly the same instant both upsert the *same*
 * row - Postgres serializes the two writes, and whichever commits last
 * is deterministically the team's answer. Every client reconciles to
 * that one row via the realtime subscription; no client-side timestamp
 * comparison is involved.
 */
export async function submitTeamAnswer(
  roomCode: string,
  gameInstanceId: string,
  questionId: string,
  teamId: string,
  optionId: string,
): Promise<void> {
  const { error } = await supabase.from("room_team_answers").upsert(
    {
      room_code: roomCode,
      game_instance_id: gameInstanceId,
      question_id: questionId,
      team_id: teamId,
      option_id: optionId,
    },
    { onConflict: "room_code,game_instance_id,question_id,team_id" },
  );

  if (error) throw error;
}

/** Change/record a team's shared Typed Answer submission - same upsert semantics as submitTeamAnswer. */
export async function submitTeamTypedAnswer(
  roomCode: string,
  gameInstanceId: string,
  questionId: string,
  teamId: string,
  textAnswer: string,
): Promise<void> {
  const { error } = await supabase.from("room_team_answers").upsert(
    {
      room_code: roomCode,
      game_instance_id: gameInstanceId,
      question_id: questionId,
      team_id: teamId,
      text_answer: textAnswer,
    },
    { onConflict: "room_code,game_instance_id,question_id,team_id" },
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

async function gradeAndPersistAnswer(answer: AnswerRecord, question: Question): Promise<void> {
  const status = gradeSubmission(question, { optionId: answer.optionId, textAnswer: answer.textAnswer });
  const points = pointsForGrade(status, question);

  const { error } = await supabase
    .from("room_answers")
    .update({ grading_status: status, points_awarded: points })
    .eq("room_code", answer.roomCode)
    .eq("game_instance_id", answer.gameInstanceId)
    .eq("question_id", answer.questionId)
    .eq("client_id", answer.clientId);

  if (error) throw error;
}

async function gradeAndPersistTeamAnswer(answer: TeamAnswerRecord, question: Question): Promise<void> {
  const status = gradeSubmission(question, { optionId: answer.optionId, textAnswer: answer.textAnswer });
  const points = pointsForGrade(status, question);

  const { error } = await supabase
    .from("room_team_answers")
    .update({ grading_status: status, points_awarded: points })
    .eq("room_code", answer.roomCode)
    .eq("game_instance_id", answer.gameInstanceId)
    .eq("question_id", answer.questionId)
    .eq("team_id", answer.teamId);

  if (error) throw error;
}

/**
 * Recomputes every competitor's total score as the sum of
 * points_awarded across *every* question answered so far this game
 * instance, and writes that sum. Recomputing from scratch (rather than
 * incrementing a running total) is what makes this safe to call after
 * every grading event - Reveal, or a Host Accept/Reject - without ever
 * double-counting: calling it twice in a row with unchanged underlying
 * data always produces the same total.
 */
async function recomputeScores(
  roomCode: string,
  gameInstanceId: string,
  competitionStyle: CompetitionStyle,
): Promise<void> {
  if (competitionStyle === "team") {
    const [teams, allTeamAnswers] = await Promise.all([
      fetchTeams(roomCode),
      fetchTeamAnswers(roomCode, gameInstanceId),
    ]);
    await Promise.all(
      teams.map((team) => {
        const thisTeamsAnswers = allTeamAnswers.filter((answer) => answer.teamId === team.id);
        return setTeamScore(roomCode, team.id, sumPointsAwarded(thisTeamsAnswers));
      }),
    );
  } else {
    const [players, allAnswers] = await Promise.all([fetchPlayers(roomCode), fetchAnswers(roomCode, gameInstanceId)]);
    await Promise.all(
      players
        .filter((player) => !player.isHost)
        .map((player) => {
          const thisPlayersAnswers = allAnswers.filter((answer) => answer.clientId === player.clientId);
          return setPlayerScore(roomCode, player.clientId, sumPointsAwarded(thisPlayersAnswers));
        }),
    );
  }
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
    deck_snapshot: RoomDeckSnapshot | null;
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
 * Reveal grades every submitted answer for the current question (Solo:
 * each player once; Team: each team once, regardless of member count -
 * the shared answer is graded exactly one time, never per member), then
 * recomputes every competitor's running total, then flips the phase -
 * so by the time any client sees "reveal" over realtime, grading and
 * scores are already written. A late-arriving answer write after this
 * point simply isn't read by anything anymore; it cannot retroactively
 * change a score that's already been computed.
 *
 * Multiple Choice grades straight to correct/incorrect here, same as
 * Milestone 2/3. Typed Answer may also land on pending_review, which
 * contributes 0 points until a Host resolves it via reviewAnswer/
 * reviewTeamAnswer below - recomputeScores is what makes that later
 * resolution update the total safely.
 */
export async function revealAndScore(
  roomCode: string,
  gameInstanceId: string,
  questionId: string,
  competitionStyle: CompetitionStyle,
  question: Question,
): Promise<{ ok: boolean }> {
  if (competitionStyle === "team") {
    const teamAnswers = await fetchTeamAnswers(roomCode, gameInstanceId, questionId);
    await Promise.all(teamAnswers.map((answer) => gradeAndPersistTeamAnswer(answer, question)));
  } else {
    const answers = await fetchAnswers(roomCode, gameInstanceId, questionId);
    await Promise.all(answers.map((answer) => gradeAndPersistAnswer(answer, question)));
  }

  await recomputeScores(roomCode, gameInstanceId, competitionStyle);

  return transitionPhase(roomCode, "question", "reveal");
}

/**
 * A Host's Accept/Reject decision on a pending_review Typed Answer.
 * Always overwrites grading_status/points_awarded/reviewed_at to the
 * new decision and then recomputes the competitor's total from scratch
 * - clicking the same decision twice, or changing Accept to Reject,
 * can never double-count or leave a stale score behind.
 */
export async function reviewAnswer(
  roomCode: string,
  gameInstanceId: string,
  questionId: string,
  clientId: string,
  decision: "correct" | "incorrect",
  question: Question,
): Promise<void> {
  const points = decision === "correct" ? question.points : 0;
  const { error } = await supabase
    .from("room_answers")
    .update({ grading_status: decision, points_awarded: points, reviewed_at: new Date().toISOString() })
    .eq("room_code", roomCode)
    .eq("game_instance_id", gameInstanceId)
    .eq("question_id", questionId)
    .eq("client_id", clientId);

  if (error) throw error;

  await recomputeScores(roomCode, gameInstanceId, "solo");
}

/** Team-answer counterpart to reviewAnswer - same reasoning, keyed by teamId. */
export async function reviewTeamAnswer(
  roomCode: string,
  gameInstanceId: string,
  questionId: string,
  teamId: string,
  decision: "correct" | "incorrect",
  question: Question,
): Promise<void> {
  const points = decision === "correct" ? question.points : 0;
  const { error } = await supabase
    .from("room_team_answers")
    .update({ grading_status: decision, points_awarded: points, reviewed_at: new Date().toISOString() })
    .eq("room_code", roomCode)
    .eq("game_instance_id", gameInstanceId)
    .eq("question_id", questionId)
    .eq("team_id", teamId);

  if (error) throw error;

  await recomputeScores(roomCode, gameInstanceId, "team");
}

/**
 * Play Again: wipes prior answers and scores (both Solo and Team tables
 * - harmless no-ops for whichever mode isn't in use, since those tables
 * are simply empty), then moves back to lobby under a brand-new
 * game_instance_id. Deleting by room_code alone clears every question's
 * answers, not just the current one, along with whatever grading/review
 * state lived on those rows. Not wrapped in a single DB transaction (no
 * RPC in this milestone) - acceptable since this is a single-host-
 * triggered, low-frequency reset with no concurrent writers. Teams and
 * player memberships are deliberately left untouched.
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
