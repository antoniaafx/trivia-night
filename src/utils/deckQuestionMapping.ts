import type { Question } from "../data/questions";
import type { DeckQuestionRecord } from "../types/deck";

/** Converts a saved Deck Question into the same discriminated-union shape gameplay already uses for hardcoded Questions. */
export function mapDeckQuestionToGameQuestion(question: DeckQuestionRecord): Question {
  if (question.answerMethod === "multiple_choice") {
    return {
      id: question.id,
      answerMethod: "multiple_choice",
      prompt: question.prompt,
      points: question.points,
      options: question.options ?? [],
      correctOptionId: question.correctOptionId ?? "",
    };
  }
  return {
    id: question.id,
    answerMethod: "typed_answer",
    prompt: question.prompt,
    points: question.points,
    correctAnswer: question.correctAnswer ?? "",
    acceptedAnswers: question.acceptedAnswers ?? [],
  };
}
