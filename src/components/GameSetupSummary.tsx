import { formatApproximateMinutes } from "../utils/formatDuration";
import type { CompetitionStyle } from "../types/game";
import type { HostParticipation, RoomDeckSnapshot } from "../utils/gamePlan";
import "./GameSetupSummary.css";

interface GameSetupSummaryProps {
  deckSnapshot: RoomDeckSnapshot | null;
  competitionStyle: CompetitionStyle;
}

/** Shared by every branch below - never shown during Invite (callers only render this component from Setup onward). */
function CompetitionAndHostLines({
  competitionStyle,
  hostParticipation,
}: {
  competitionStyle: CompetitionStyle;
  hostParticipation: HostParticipation;
}) {
  return (
    <p className="game-setup-summary-status">
      Competition: {competitionStyle === "team" ? "Teams" : "Solo"} · Host:{" "}
      {hostParticipation === "playing_host" ? "Playing" : "Dedicated Host"}
    </p>
  );
}

/**
 * The read-only lineup Players and the Stage see from the Game Setup
 * stage onward (never during Invite - see PlayerRoomPage/StagePage,
 * which only render this once the Host has moved past Invite).
 * Deliberately shows only what's safe before the game starts: Deck
 * names in order, how many Questions each contributes, the overall
 * total/estimate, competition style, and Host Participation - never
 * correct answers, accepted variants, points, which Questions are
 * incomplete, or the per-section second-by-second allocation math the
 * Host's own setup panel works with. There is no "ready" state to
 * distinguish here - Start Game is the only checkpoint, so any
 * `planned_game` snapshot simply reads as "the Host is setting up the
 * game" until the moment it's replaced with a frozen `game_plan`.
 */
function GameSetupSummary({ deckSnapshot, competitionStyle }: GameSetupSummaryProps) {
  if (deckSnapshot === null) {
    return (
      <div className="game-setup-summary">
        <p className="game-setup-summary-status">Playing the built-in sample Questions.</p>
      </div>
    );
  }

  if (deckSnapshot.kind === "planned_game") {
    const readinessLine = (
      <p className="game-setup-summary-status" role="status">
        The Host is setting up the game.
      </p>
    );

    if (deckSnapshot.isQuickPlay) {
      return (
        <div className="game-setup-summary">
          <p className="game-setup-summary-status">Playing the built-in sample Questions.</p>
          <CompetitionAndHostLines
            competitionStyle={competitionStyle}
            hostParticipation={deckSnapshot.hostParticipation}
          />
          {readinessLine}
        </div>
      );
    }

    if (deckSnapshot.selectedDeckIds.length === 0) {
      return (
        <div className="game-setup-summary">
          <p className="game-setup-summary-status" role="status">
            The Host is choosing tonight&rsquo;s trivia.
          </p>
          <CompetitionAndHostLines
            competitionStyle={competitionStyle}
            hostParticipation={deckSnapshot.hostParticipation}
          />
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
          <CompetitionAndHostLines
            competitionStyle={competitionStyle}
            hostParticipation={deckSnapshot.hostParticipation}
          />
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
        <CompetitionAndHostLines competitionStyle={competitionStyle} hostParticipation={deckSnapshot.hostParticipation} />
        {readinessLine}
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
      <CompetitionAndHostLines competitionStyle={competitionStyle} hostParticipation={deckSnapshot.hostParticipation} />
    </div>
  );
}

export default GameSetupSummary;
