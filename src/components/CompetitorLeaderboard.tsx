import { sortLeaderboard } from "../utils/scoring";
import type { Competitor } from "../types/game";
import "./CompetitorLeaderboard.css";

interface CompetitorLeaderboardProps {
  competitors: Competitor[];
  /** The current viewer's own id (player) or team id - given a subtle highlight, never a different layout. */
  highlightId?: string | null;
  emptyMessage?: string;
}

/**
 * Renders a ranked list for either Solo (Player competitors) or Team
 * Mode (Team competitors) - the same component, fed through the shared
 * Competitor abstraction, used by the Host, Player, and Stage pages
 * alike. This is what "avoid duplicated leaderboard logic" means in the
 * UI layer, not just in scoring.ts.
 */
function CompetitorLeaderboard({
  competitors,
  highlightId,
  emptyMessage = "No one to show yet.",
}: CompetitorLeaderboardProps) {
  const ranked = sortLeaderboard(competitors);

  if (ranked.length === 0) {
    return <p className="competitor-leaderboard-empty">{emptyMessage}</p>;
  }

  return (
    <ol className="competitor-leaderboard">
      {ranked.map((competitor, index) => (
        <li
          key={competitor.id}
          className={
            competitor.id === highlightId
              ? "competitor-leaderboard-row competitor-leaderboard-highlight"
              : "competitor-leaderboard-row"
          }
        >
          <span className="competitor-leaderboard-rank">{index + 1}</span>
          <span className="competitor-leaderboard-name">{competitor.displayName}</span>
          <span className="competitor-leaderboard-score">{competitor.score}</span>
        </li>
      ))}
    </ol>
  );
}

export default CompetitorLeaderboard;
