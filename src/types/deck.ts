import type { AnswerMethod, QuestionOption } from "../data/questions";

/** The authoritative `decks` row. */
export interface DeckRecord {
  id: string;
  creatorId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastHostedAt: string | null;
}

/** DeckRecord plus the planning info My Decks shows - question count, a rough duration estimate, and how many Questions still need attention. */
export interface DeckSummary extends DeckRecord {
  questionCount: number;
  /** Sum of QUESTION_SECONDS_ESTIMATE across complete Questions only - incomplete Questions never count toward playable duration. */
  estimatedSeconds: number;
  incompleteCount: number;
}

/**
 * A `deck_questions` row. Mirrors the same nullable-by-answer-method
 * shape as room_answers/room_team_answers (Milestone 4): exactly one of
 * the Multiple-Choice fields (options, correctOptionId) or the
 * Typed-Answer fields (correctAnswer, acceptedAnswers) is ever
 * meaningful, matching answerMethod. `position` is a plain number
 * (stored as Postgres `numeric`) rather than an array index - see
 * src/services/deckRepository.ts for why (fractional positions let
 * "duplicate, insert after" touch only one row).
 */
export interface DeckQuestionRecord {
  id: string;
  deckId: string;
  position: number;
  answerMethod: AnswerMethod;
  prompt: string;
  points: number;
  options: QuestionOption[] | null;
  correctOptionId: string | null;
  correctAnswer: string | null;
  acceptedAnswers: string[] | null;
  createdAt: string;
  updatedAt: string;
}
