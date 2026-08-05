import { QUESTIONS } from "../data/questions";
import { estimateGameDurationMinutes, formatEstimatedDuration } from "../config/timingEstimates";
import type { CompetitionStyle } from "../types/game";
import type { HostParticipation, PlannedGamePlanSummary, QuestionFlow } from "../utils/gamePlan";

interface GameSummaryCardProps {
  planSummary: PlannedGamePlanSummary;
  competitionStyle: CompetitionStyle;
  questionTimerSeconds: number | null;
  questionFlow: QuestionFlow;
  hostParticipation: HostParticipation;
}

/**
 * The at-a-glance "what are we about to play" card - shared verbatim by
 * the Host Dashboard (GameSetupPhase, live-editable settings above it)
 * and the Player Lobby (PlayerLobbyPhase, read-only: a Player never sees
 * the editable controls, only this same summary of whatever the Host
 * has chosen so far). Key/value rows, not a sentence, so both pages read
 * it the same way: each row pairs a fixed label with the value it
 * currently holds. Updates live as the Host changes any setting - there
 * is no separate "confirmed" step.
 */
function GameSummaryCard({
  planSummary,
  competitionStyle,
  questionTimerSeconds,
  questionFlow,
  hostParticipation,
}: GameSummaryCardProps) {
  const deckLabel = planSummary.deckCount === 0 ? "Quick Play" : `${planSummary.deckCount} Selected`;
  // planSummary is computed purely from selected Decks (see
  // computePlanSummary) and is empty for Quick Play, which plays the
  // hardcoded QUESTIONS list instead - reading its real length here
  // rather than showing planSummary's (correct-but-misleading, for
  // Quick Play) 0.
  const questionCount = planSummary.deckCount === 0 ? QUESTIONS.length : planSummary.questionCount;
  const estimatedMinutes = estimateGameDurationMinutes({ questionCount, questionTimerSeconds });

  const rows: [string, string][] = [
    ["Competition", competitionStyle === "team" ? "Teams" : "Solo"],
    ["Decks", deckLabel],
    ["Questions", String(questionCount)],
    ["Question Timer", questionTimerSeconds === null ? "No Timer" : `${questionTimerSeconds} Seconds`],
    ["Question Flow", questionFlow === "host_controlled" ? "Host Controlled" : "Automatic"],
    ["Host", hostParticipation === "playing_host" ? "Host Playing" : "Dedicated Host"],
    ["Estimated Time", formatEstimatedDuration(estimatedMinutes)],
  ];

  return (
    <section className="host-dashboard-section host-dashboard-summary">
      <h3>Game Summary</h3>
      <dl className="host-dashboard-summary-list">
        {rows.map(([label, value]) => (
          <div className="host-dashboard-summary-row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default GameSummaryCard;
