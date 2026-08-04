import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchDeck, fetchDeckQuestions } from "../services/deckRepository";
import { mapDeckQuestionToGameQuestion } from "../utils/deckQuestionMapping";
import { computeDeckReadiness } from "../utils/deckValidation";
import LoadingScreen from "../components/LoadingScreen";
import type { DeckQuestionRecord, DeckRecord } from "../types/deck";
import "../pages/StagePage.css";
import "./DeckPreviewPage.css";

/**
 * Previews saved state only - a fresh route load always reflects
 * whatever's currently in the database, never an unsaved local draft
 * still sitting in the editor's debounce window (see the Milestone 5
 * report for why this rule was chosen over previewing local edits).
 * Reuses the Stage's own option/prompt styling (see the StagePage.css
 * import) so what a creator previews looks like what players will
 * actually see. Never creates a room, a realtime subscription, an
 * answer, or a score - purely a read of the Deck's saved content.
 */
function DeckPreviewPage() {
  const { deckId = "" } = useParams<{ deckId: string }>();
  const [deck, setDeck] = useState<DeckRecord | null>(null);
  const [questions, setQuestions] = useState<DeckQuestionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [deckRecord, questionRecords] = await Promise.all([fetchDeck(deckId), fetchDeckQuestions(deckId)]);
        if (cancelled) return;
        if (!deckRecord) {
          setError("This Deck couldn't be found.");
          return;
        }
        const readiness = computeDeckReadiness(questionRecords);
        if (!readiness.ready) {
          setError(`This Deck isn't ready to preview yet: ${readiness.problems[0]}`);
          return;
        }
        setDeck(deckRecord);
        setQuestions([...questionRecords].sort((a, b) => a.position - b.position));
      } catch {
        if (!cancelled) setError("Couldn't load this Deck. Try refreshing.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  if (error) {
    return (
      <div className="deck-preview-message">
        <p role="alert">{error}</p>
        <Link to={`/decks/${deckId}`} className="btn btn-primary">
          Back to editor
        </Link>
      </div>
    );
  }

  if (!deck || !questions) {
    return <LoadingScreen message="Loading preview..." />;
  }

  const question = mapDeckQuestionToGameQuestion(questions[index]);

  return (
    <div className="stage deck-preview">
      <p className="stage-eyebrow">
        Preview — {deck.title} — Question {index + 1} of {questions.length}
      </p>
      <h1>{question.prompt}</h1>

      {question.answerMethod === "multiple_choice" ? (
        <div className="stage-options">
          {question.options.map((option, index) => (
            <div
              key={option.id}
              className={`stage-option${option.id === question.correctOptionId ? " deck-preview-correct" : ""}`}
            >
              <span className="stage-option-letter">{String.fromCharCode(65 + index)}</span>
              {option.text}
              {option.id === question.correctOptionId && " (correct)"}
            </div>
          ))}
        </div>
      ) : (
        <div className="deck-preview-typed">
          <p>
            Correct answer: <strong>{question.correctAnswer}</strong>
          </p>
          {question.acceptedAnswers.length > 0 && <p>Also accepted: {question.acceptedAnswers.join(", ")}</p>}
        </div>
      )}

      <div className="deck-preview-nav">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setIndex((current) => current - 1)}
          disabled={index === 0}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setIndex((current) => current + 1)}
          disabled={index === questions.length - 1}
        >
          Next
        </button>
      </div>

      <Link to={`/decks/${deckId}`} className="deck-preview-return">
        Return to editor
      </Link>
    </div>
  );
}

export default DeckPreviewPage;
