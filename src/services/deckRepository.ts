import { supabase } from "./supabaseClient";
import { computeAppendPosition, computeInsertAfterPosition, normalizedPositions } from "../utils/deckPositions";
import { isQuestionComplete } from "../utils/deckValidation";
import { QUESTION_SECONDS_ESTIMATE } from "../config/timingEstimates";
import type { AnswerMethod, QuestionOption } from "../data/questions";
import type { DeckQuestionRecord, DeckRecord, DeckSummary } from "../types/deck";

/**
 * All Postgres reads/writes for Deck authoring live here, separate from
 * gameRoomRepository.ts (live gameplay) - a different bounded concern
 * with its own persistence shape and no realtime needs. Raw snake_case
 * rows are mapped to the camelCase types the rest of the app uses;
 * nothing outside this file should know the DB column names.
 */

interface DeckRow {
  id: string;
  creator_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_hosted_at: string | null;
}

interface DeckQuestionRow {
  id: string;
  deck_id: string;
  position: number;
  answer_method: string;
  prompt: string;
  points: number;
  options: QuestionOption[] | null;
  correct_option_id: string | null;
  correct_answer: string | null;
  accepted_answers: string[] | null;
  created_at: string;
  updated_at: string;
}

function mapDeckRow(row: DeckRow): DeckRecord {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastHostedAt: row.last_hosted_at,
  };
}

function mapDeckQuestionRow(row: DeckQuestionRow): DeckQuestionRecord {
  return {
    id: row.id,
    deckId: row.deck_id,
    position: row.position,
    answerMethod: row.answer_method as AnswerMethod,
    prompt: row.prompt,
    points: row.points,
    options: row.options,
    correctOptionId: row.correct_option_id,
    correctAnswer: row.correct_answer,
    acceptedAnswers: row.accepted_answers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every Deck the creator owns, each paired with its full (ordered) Question list - the shape Game Setup's readiness/picker logic needs. */
export async function fetchDecksWithQuestions(
  creatorId: string,
): Promise<{ deck: DeckRecord; questions: DeckQuestionRecord[] }[]> {
  const { data: deckRows, error: decksError } = await supabase
    .from("decks")
    .select("*")
    .eq("creator_id", creatorId)
    .order("updated_at", { ascending: false });
  if (decksError) throw decksError;

  const decks = (deckRows ?? []).map((row) => mapDeckRow(row as DeckRow));
  if (decks.length === 0) return [];

  const { data: questionRows, error: questionsError } = await supabase
    .from("deck_questions")
    .select("*")
    .in(
      "deck_id",
      decks.map((deck) => deck.id),
    )
    .order("position", { ascending: true });
  if (questionsError) throw questionsError;

  const questionsByDeck = new Map<string, DeckQuestionRecord[]>();
  for (const row of questionRows ?? []) {
    const question = mapDeckQuestionRow(row as DeckQuestionRow);
    const list = questionsByDeck.get(question.deckId) ?? [];
    list.push(question);
    questionsByDeck.set(question.deckId, list);
  }

  return decks.map((deck) => ({ deck, questions: questionsByDeck.get(deck.id) ?? [] }));
}

export async function fetchDecksForCreator(creatorId: string): Promise<DeckSummary[]> {
  const decksWithQuestions = await fetchDecksWithQuestions(creatorId);

  return decksWithQuestions.map(({ deck, questions }) => {
    const completeQuestions = questions.filter(isQuestionComplete);
    return {
      ...deck,
      questionCount: questions.length,
      estimatedSeconds: completeQuestions.reduce(
        (sum, question) => sum + QUESTION_SECONDS_ESTIMATE[question.answerMethod],
        0,
      ),
      incompleteCount: questions.length - completeQuestions.length,
    };
  });
}

export async function fetchDeck(deckId: string): Promise<DeckRecord | null> {
  const { data, error } = await supabase.from("decks").select("*").eq("id", deckId).maybeSingle();
  if (error) throw error;
  return data ? mapDeckRow(data as DeckRow) : null;
}

export async function fetchDeckQuestions(deckId: string): Promise<DeckQuestionRecord[]> {
  const { data, error } = await supabase
    .from("deck_questions")
    .select("*")
    .eq("deck_id", deckId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapDeckQuestionRow(row as DeckQuestionRow));
}

/** Instant by design: a blank Deck the creator can rename and start writing into immediately. */
export async function createDeck(creatorId: string): Promise<DeckRecord> {
  const { data, error } = await supabase.from("decks").insert({ creator_id: creatorId }).select().single();
  if (error) throw error;
  return mapDeckRow(data as DeckRow);
}

export async function renameDeck(deckId: string, title: string, signal?: AbortSignal): Promise<void> {
  let query = supabase.from("decks").update({ title, updated_at: new Date().toISOString() }).eq("id", deckId);
  if (signal) query = query.abortSignal(signal);
  const { error } = await query;
  if (error) throw error;
}

export async function markDeckHosted(deckId: string): Promise<void> {
  const { error } = await supabase.from("decks").update({ last_hosted_at: new Date().toISOString() }).eq("id", deckId);
  if (error) throw error;
}

/** Deleting a Deck cascades to its Questions (on delete cascade) - never touches any room's already-taken snapshot. */
export async function deleteDeck(deckId: string): Promise<void> {
  const { error } = await supabase.from("decks").delete().eq("id", deckId);
  if (error) throw error;
}

/**
 * Atomic through the duplicate_deck() Postgres function (see
 * 0004_creator_mvp.sql) - copying a Deck touches two tables with a
 * foreign-key dependency, the one operation here that genuinely needs
 * single-transaction guarantees a plain client-side sequence of calls
 * can't give it.
 */
export async function duplicateDeck(deckId: string, creatorId: string): Promise<string> {
  const { data, error } = await supabase.rpc("duplicate_deck", {
    source_deck_id: deckId,
    new_creator_id: creatorId,
  });
  if (error) throw error;
  return data as string;
}

async function touchDeck(deckId: string): Promise<void> {
  const { error } = await supabase.from("decks").update({ updated_at: new Date().toISOString() }).eq("id", deckId);
  if (error) throw error;
}

const DEFAULT_MC_OPTION_COUNT = 4;
const DEFAULT_POINTS = 100;

function makeDefaultOptions(): QuestionOption[] {
  return Array.from({ length: DEFAULT_MC_OPTION_COUNT }, () => ({ id: crypto.randomUUID(), text: "" }));
}

/** Add Question always appends at the end - duplicateQuestion below is the only insert-in-the-middle path. */
export async function appendQuestion(deckId: string, answerMethod: AnswerMethod): Promise<DeckQuestionRecord> {
  const existing = await fetchDeckQuestions(deckId);
  const position = computeAppendPosition(existing);

  const payload = {
    deck_id: deckId,
    position,
    answer_method: answerMethod,
    prompt: "",
    points: DEFAULT_POINTS,
    options: answerMethod === "multiple_choice" ? makeDefaultOptions() : null,
    correct_option_id: null,
    correct_answer: answerMethod === "typed_answer" ? "" : null,
    accepted_answers: answerMethod === "typed_answer" ? [] : null,
  };

  const { data, error } = await supabase.from("deck_questions").insert(payload).select().single();
  if (error) throw error;
  await touchDeck(deckId);
  return mapDeckQuestionRow(data as DeckQuestionRow);
}

/**
 * Takes full rows (not just {id, position}) because PostgREST's upsert
 * validates every NOT NULL column while constructing the INSERT side of
 * `INSERT ... ON CONFLICT DO UPDATE` *before* it even checks whether a
 * conflict will occur - a payload with only {id, position} fails with a
 * "null value in column deck_id" error even though every row already
 * exists and only ever takes the UPDATE branch. Sending the complete
 * row (with just `position` changed) sidesteps that entirely. One
 * upsert call is still one PostgREST request = one transaction, so the
 * deferred unique constraint on (deck_id, position) never trips even
 * though several rows' positions change together in the same write.
 */
async function bulkSetPositions(rows: DeckQuestionRecord[]): Promise<void> {
  const { error } = await supabase.from("deck_questions").upsert(
    rows.map((row) => ({
      id: row.id,
      deck_id: row.deckId,
      position: row.position,
      answer_method: row.answerMethod,
      prompt: row.prompt,
      points: row.points,
      options: row.options,
      correct_option_id: row.correctOptionId,
      correct_answer: row.correctAnswer,
      accepted_answers: row.acceptedAnswers,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "id" },
  );
  if (error) throw error;
}

function withNormalizedPositions(rows: DeckQuestionRecord[]): DeckQuestionRecord[] {
  const positioned = normalizedPositions(rows);
  const positionById = new Map(positioned.map((item) => [item.id, item.position]));
  return rows.map((row) => ({ ...row, position: positionById.get(row.id) ?? row.position }));
}

/** Inserts an independent copy immediately after `source` - the primary V1 reuse mechanism (no Question Bank). */
export async function duplicateQuestion(deckId: string, source: DeckQuestionRecord): Promise<DeckQuestionRecord> {
  let existing = await fetchDeckQuestions(deckId);
  let position = computeInsertAfterPosition(existing, source.id);

  if (position === null) {
    // Repeated duplication has pushed two neighbors' positions too
    // close together to safely subdivide - renormalize the whole Deck
    // to fresh, evenly-spaced values first, then retry with room again.
    await bulkSetPositions(withNormalizedPositions(existing));
    existing = await fetchDeckQuestions(deckId);
    position = computeInsertAfterPosition(existing, source.id);
    if (position === null) {
      throw new Error("Couldn't place the duplicated question. Try again.");
    }
  }

  const payload = {
    deck_id: deckId,
    position,
    answer_method: source.answerMethod,
    prompt: source.prompt,
    points: source.points,
    options: source.options,
    correct_option_id: source.correctOptionId,
    correct_answer: source.correctAnswer,
    accepted_answers: source.acceptedAnswers,
  };

  const { data, error } = await supabase.from("deck_questions").insert(payload).select().single();
  if (error) throw error;
  await touchDeck(deckId);
  return mapDeckQuestionRow(data as DeckQuestionRow);
}

/** Move Up/Down - swaps two adjacent Questions' positions in one atomic write. No-ops at either boundary. */
export async function moveQuestion(
  deckId: string,
  ordered: DeckQuestionRecord[],
  questionId: string,
  direction: "up" | "down",
): Promise<void> {
  const index = ordered.findIndex((question) => question.id === questionId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= ordered.length) return;

  const a = ordered[index];
  const b = ordered[swapIndex];
  await bulkSetPositions([
    { ...a, position: b.position },
    { ...b, position: a.position },
  ]);
  await touchDeck(deckId);
}

export interface DeckQuestionPatch {
  prompt?: string;
  points?: number;
  options?: QuestionOption[];
  correctOptionId?: string | null;
  correctAnswer?: string;
  acceptedAnswers?: string[];
}

/** The autosave write path - every field is optional so a single-field edit only ever touches that column. */
export async function updateQuestion(
  deckId: string,
  questionId: string,
  patch: DeckQuestionPatch,
  signal?: AbortSignal,
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.prompt !== undefined) payload.prompt = patch.prompt;
  if (patch.points !== undefined) payload.points = patch.points;
  if (patch.options !== undefined) payload.options = patch.options;
  if (patch.correctOptionId !== undefined) payload.correct_option_id = patch.correctOptionId;
  if (patch.correctAnswer !== undefined) payload.correct_answer = patch.correctAnswer;
  if (patch.acceptedAnswers !== undefined) payload.accepted_answers = patch.acceptedAnswers;

  let query = supabase.from("deck_questions").update(payload).eq("id", questionId);
  if (signal) query = query.abortSignal(signal);
  const { error } = await query;
  if (error) throw error;

  await touchDeck(deckId);
}

export async function deleteQuestion(deckId: string, questionId: string): Promise<void> {
  const { error } = await supabase.from("deck_questions").delete().eq("id", questionId);
  if (error) throw error;
  await touchDeck(deckId);
}

/**
 * Undo for a just-deleted Question: re-inserts the exact same row (same
 * id, same position, same content). Because no sibling's position
 * changed when it was deleted, restoring it needs no renumbering either
 * - the Deck returns to exactly its pre-delete shape.
 */
export async function restoreQuestion(deckId: string, question: DeckQuestionRecord): Promise<void> {
  const payload = {
    id: question.id,
    deck_id: deckId,
    position: question.position,
    answer_method: question.answerMethod,
    prompt: question.prompt,
    points: question.points,
    options: question.options,
    correct_option_id: question.correctOptionId,
    correct_answer: question.correctAnswer,
    accepted_answers: question.acceptedAnswers,
  };
  const { error } = await supabase.from("deck_questions").insert(payload);
  if (error) throw error;
  await touchDeck(deckId);
}
