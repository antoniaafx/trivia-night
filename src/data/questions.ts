/**
 * Milestone 2 uses exactly one hardcoded question. This is deliberately
 * a single file, not spread across components, so the eventual Deck
 * system (approved Content Architecture: Deck -> Round -> Question) can
 * replace `getQuestionById` with a real lookup without touching any
 * page component.
 */
export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  prompt: string;
  options: QuestionOption[];
  correctOptionId: string;
  points: number;
}

export const HARDCODED_QUESTION: Question = {
  id: "q1",
  prompt: "What is the capital of Australia?",
  options: [
    { id: "A", text: "Sydney" },
    { id: "B", text: "Canberra" },
    { id: "C", text: "Melbourne" },
    { id: "D", text: "Perth" },
  ],
  correctOptionId: "B",
  points: 100,
};

// TODO: once the Deck system exists, this becomes a real lookup against
// a Deck's questions instead of a single constant.
export function getQuestionById(id: string | null): Question | null {
  if (id === HARDCODED_QUESTION.id) return HARDCODED_QUESTION;
  return null;
}
