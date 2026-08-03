import { formatApproximateMinutes } from "../utils/formatDuration";
import type { RoomDeckSnapshot } from "../utils/gamePlan";
import "./GameSetupSummary.css";

interface GameSetupSummaryProps {
  deckSnapshot: RoomDeckSnapshot | null;
}

/**
 * The read-only lineup Players and the Stage see while the Host is
 * still setting up (or reusing a locked rematch plan) in the Lobby.
 * Deliberately shows only what's safe before the game starts: Deck
 * names in order, how many Questions each contributes, and the overall
 * total/estimate - never correct answers, accepted variants, points,
 * which Questions are incomplete, or the per-section second-by-second
 * allocation math the Host's own setup panel works with.
 */
function GameSetupSummary({ deckSnapshot }: GameSetupSummaryProps) {
  if (deckSnapshot === null) {
    return (
      <div className="game-setup-summary">
        <p className="game-setup-summary-status">Playing the built-in sample Questions.</p>
      </div>
    );
  }

  if (deckSnapshot.kind === "planned_game") {
    if (deckSnapshot.selectedDeckIds.length === 0) {
      return (
        <div className="game-setup-summary">
          <p className="game-setup-summary-status" role="status">
            The Host is choosing tonight&rsquo;s trivia.
          </p>
        </div>
      );
    }

    const { planSummary } = deckSnapshot;
    if (planSummary.questionCount === 0) {
      return (
        <div className="game-setup-summary">
          <p className="game-setup-summary-status" role="status">
            The Host is still setting up the game.
          </p>
        </div>
      );
    }

    return (
      <div className="game-setup-summary">
        <ul className="game-setup-summary-list">
          {planSummary.sections.map((section, index) => (
            <li key={section.deckId}>
              {index + 1}. {section.deckTitle} · {section.selectedQuestionCount} Question
              {section.selectedQuestionCount === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
        <p className="game-setup-summary-status">
          {planSummary.deckCount} Deck{planSummary.deckCount === 1 ? "" : "s"} · {planSummary.questionCount} Question
          {planSummary.questionCount === 1 ? "" : "s"} · {formatApproximateMinutes(planSummary.estimatedDurationSeconds)}
        </p>
        <p className="game-setup-summary-status" role="status">
          Everything is ready. Waiting for the Host to start.
        </p>
      </div>
    );
  }

  // kind "game_plan" - a locked rematch, replaying the exact same lineup.
  return (
    <div className="game-setup-summary">
      <p className="game-setup-summary-status" role="status">
        Playing the same lineup as last time.
      </p>
      <ul className="game-setup-summary-list">
        {deckSnapshot.sections.map((section, index) => (
          <li key={section.deckId}>
            {index + 1}. {section.deckTitle} · {section.questionIds.length} Question
            {section.questionIds.length === 1 ? "" : "s"}
          </li>
        ))}
      </ul>
      <p className="game-setup-summary-status">
        {deckSnapshot.sections.length} Deck{deckSnapshot.sections.length === 1 ? "" : "s"} ·{" "}
        {deckSnapshot.questions.length} Question{deckSnapshot.questions.length === 1 ? "" : "s"} ·{" "}
        {formatApproximateMinutes(deckSnapshot.estimatedDurationSeconds)}
      </p>
    </div>
  );
}

export default GameSetupSummary;
