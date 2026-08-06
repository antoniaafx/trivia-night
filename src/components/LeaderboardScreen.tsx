import type { ReactNode } from "react";
import { computeWinners, sortLeaderboard } from "../utils/scoring";
import type { Competitor } from "../types/game";

interface LeaderboardScreenProps {
  ended: boolean;
  competitors: Competitor[];
  unitLabel: string;
  totalQuestions: number;
  winnerIds: string[];
  /** Player-only: highlights this competitor's own row. Omitted (or null) on the Host page - the Host is never a `Competitor`. */
  highlightCompetitorId?: string | null;
  /** Label shown on the highlighted row, e.g. "You" or "Your Team". Only read when `highlightCompetitorId` is set. */
  highlightLabel?: string;
  /** Host gets Show Winner/Play Again (or the typed-answer review queue blocking it); Player gets a plain waiting message. See each page's own wrapper. */
  footer: ReactNode;
}

/**
 * The standings screen - one component rendered by both the Host
 * (HostControlPanelPage's HostLeaderboardPhase) and the Player
 * (PlayerRoomPage's PlayerLeaderboardPhase), covering both the
 * `leaderboard` and `ended` room phases the same "two states of one
 * screen" way LiveGamePhase/PlayerLiveQuestionPhase already do for
 * Question/Reveal. This app's game structure only ever has a single
 * standings moment - `leaderboard` is reached once, after the last
 * Question of the last Deck (see ALLOWED_PHASE_TRANSITIONS in
 * types/game.ts), never once per Deck - so there is no "Deck Winner,"
 * no mid-game standings checkpoint, and nothing to compute a rank
 * *change* against (see TRIVIA_NIGHT_MEMORY.md).
 *
 * The Host and Player pages differ only in the `footer` slot (moderation
 * controls vs. a passive status line) and in whether `highlightCompetitorId`
 * is ever set (Player-only - the Host is never a `Competitor`) - the
 * header, winner banner, and ranked list are pixel-identical between the
 * two, right down to the shared CSS file (styles/leaderboardShell.css)
 * and the same `live-game-row-in` mount animation. Renders its own ranked
 * rows (via `sortLeaderboard`) rather than reusing the simpler shared
 * `CompetitorLeaderboard` component, which the Stage page still uses
 * unchanged and is out of scope here.
 */
function LeaderboardScreen({
  ended,
  competitors,
  unitLabel,
  totalQuestions,
  winnerIds,
  highlightCompetitorId = null,
  highlightLabel = "You",
  footer,
}: LeaderboardScreenProps) {
  const ranked = sortLeaderboard(competitors);
  const winners = ended ? computeWinners(competitors).filter((competitor) => winnerIds.includes(competitor.id)) : [];

  return (
    <div className="host-leaderboard">
      <header className="host-leaderboard-header">
        <div>
          <p className="host-leaderboard-eyebrow">Final Results</p>
          <h2>{ended ? "Trivia Complete" : "Current Standings"}</h2>
        </div>
        <p className="host-leaderboard-progress">
          {totalQuestions} Question{totalQuestions === 1 ? "" : "s"} Complete
        </p>
      </header>

      {ended && (
        <div className="host-leaderboard-winner-banner">
          {winners.length === 0 ? (
            <p>No {unitLabel}s took part</p>
          ) : (
            <>
              <p className="host-leaderboard-winner-label">
                <span aria-hidden="true">🏆</span> Winner
              </p>
              <p className="host-leaderboard-winner-name">
                {winners.map((competitor) => competitor.displayName).join(" & ")}
              </p>
              <p className="host-leaderboard-winner-score">
                {winners[0].score} Point{winners[0].score === 1 ? "" : "s"}
              </p>
            </>
          )}
        </div>
      )}

      {ranked.length === 0 ? (
        <p className="host-leaderboard-empty">No {unitLabel}s to show yet.</p>
      ) : (
        <ol className="host-leaderboard-list">
          {ranked.map((competitor, index) => {
            const rank = index + 1;
            const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
            const isYou = highlightCompetitorId !== null && competitor.id === highlightCompetitorId;
            return (
              <li
                key={competitor.id}
                className={`host-leaderboard-row${rank <= 3 ? " is-podium" : ""}${
                  ended && winnerIds.includes(competitor.id) ? " is-winner" : ""
                }${isYou ? " is-you" : ""}`}
              >
                <span className="host-leaderboard-rank">
                  {medal ? (
                    <>
                      <span aria-hidden="true">{medal}</span>
                      <span className="sr-only-label">Rank {rank}</span>
                    </>
                  ) : (
                    rank
                  )}
                </span>
                <span className="host-leaderboard-name">
                  {competitor.displayName}
                  {isYou && <span className="host-leaderboard-you-tag">{highlightLabel}</span>}
                </span>
                <span className="host-leaderboard-score">{competitor.score} pts</span>
              </li>
            );
          })}
        </ol>
      )}

      {footer}
    </div>
  );
}

export default LeaderboardScreen;
