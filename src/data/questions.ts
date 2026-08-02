/**
 * Milestone 4 uses two hardcoded questions (one per answer method). This
 * is deliberately a single file, not spread across components, so the
 * eventual Deck system (approved Content Architecture: Deck -> Round ->
 * Question) can replace this module with a real lookup without touching
 * any page component.
 *
 * Question is a discriminated union on `answerMethod` so every consumer
 * narrows safely (`question.answerMethod === "typed_answer"` gives you
 * `correctAnswer`/`acceptedAnswers` with no cast) instead of one loose
 * shape with fields that are only sometimes meaningful. Kept flat rather
 * than nesting an `answerPayload` object - with only two answer methods
 * and no shipped UI needing the extra fields a richer model suggests
 * (duration, explanation, presenter notes), flattening is the smaller,
 * equally type-safe shape. Adding a media attachment later is still a
 * matter of adding an optional field to the union members, not a
 * redesign.
 */
export interface QuestionOption {
  id: string;
  text: string;
}

interface QuestionBase {
  id: string;
  prompt: string;
  points: number;
}

export interface MultipleChoiceQuestion extends QuestionBase {
  answerMethod: "multiple_choice";
  options: QuestionOption[];
  correctOptionId: string;
}

export interface TypedAnswerQuestion extends QuestionBase {
  answerMethod: "typed_answer";
  /** The canonical correct answer, shown to the Host and in review copy. */
  correctAnswer: string;
  /** Additional accepted variants. Does not include correctAnswer itself. */
  acceptedAnswers: string[];
}

export type Question = MultipleChoiceQuestion | TypedAnswerQuestion;

export const QUESTIONS: Question[] = [
  {
    id: "q1",
    answerMethod: "multiple_choice",
    prompt: "What is the capital of Australia?",
    points: 100,
    options: [
      { id: "A", text: "Sydney" },
      { id: "B", text: "Canberra" },
      { id: "C", text: "Melbourne" },
      { id: "D", text: "Perth" },
    ],
    correctOptionId: "B",
  },
  {
    id: "q2",
    answerMethod: "typed_answer",
    prompt: "Who wrote Romeo and Juliet?",
    points: 100,
    correctAnswer: "William Shakespeare",
    acceptedAnswers: ["Shakespeare", "W Shakespeare", "W. Shakespeare"],
  },
];

export const FIRST_QUESTION_ID = QUESTIONS[0].id;

export function getQuestionById(id: string | null): Question | null {
  return QUESTIONS.find((question) => question.id === id) ?? null;
}

/** Null once the last question has been reached - the caller's signal that only Leaderboard remains. */
export function getNextQuestionId(currentQuestionId: string | null): string | null {
  const index = QUESTIONS.findIndex((question) => question.id === currentQuestionId);
  if (index === -1 || index + 1 >= QUESTIONS.length) return null;
  return QUESTIONS[index + 1].id;
}
