import { Link, useParams } from "react-router-dom";
import { useGameRoom } from "../hooks/useGameRoom";
import { useCountdown } from "../hooks/useCountdown";
import { getQuestionById, QUESTIONS } from "../data/questions";
import { computeAggregateReveal, computeWinners } from "../utils/scoring";
import { findSectionForQuestion } from "../utils/gamePlan";
import { formatCountdown } from "../utils/timer";
import { buildJoinUrl } from "../utils/roomLinks";
import LoadingScreen from "../components/LoadingScreen";
import CompetitorLeaderboard from "../components/CompetitorLeaderboard";
import GameSetupSummary from "../components/GameSetupSummary";
import RoomQrCode from "../components/RoomQrCode";
import type { GradedLike } from "../utils/scoring";
import type { Competitor } from "../types/game";
import { playerToCompetitor, teamToCompetitor } from "../types/game";
import "./StagePage.css";

function questionNumber(questionId: string | null): number {
  return QUESTIONS.findIndex((question) => question.id === questionId) + 1;
}

/**
 * Placeholder-simple stand-ins for the custom mascots planned later -
 * an animal emoji per joined Player, not a name (the Stage is read
 * from across a room, where an emoji reads faster than text - see the
 * "no player names" requirement). Hashing clientId (not array index)
 * keeps each Player's avatar stable across joins/leaves elsewhere in
 * the list, rather than reshuffling everyone whenever the roster
 * changes shape.
 */
const STAGE_AVATAR_EMOJIS = [
  "🐼",
  "🐸",
  "🐧",
  "🐰",
  "🦊",
  "🐻",
  "🐨",
  "🐯",
  "🦁",
  "🐮",
  "🐷",
  "🐵",
  "🐶",
  "🐱",
  "🐹",
  "🐺",
];
const STAGE_AVATAR_VISIBLE_LIMIT = 24;

function avatarForClientId(clientId: string): string {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = (hash * 31 + clientId.charCodeAt(i)) >>> 0;
  }
  return STAGE_AVATAR_EMOJIS[hash % STAGE_AVATAR_EMOJIS.length];
}

/**
 * The shared display. Read-only by design: no host controls render
 * here under any circumstance, and it never shows anything a host
 * hasn't already revealed to the room (no correct answer or submitted
 * text during the question phase, no per-player or per-team-member
 * answers ever - not even after Reveal, only the aggregate).
 */
function StagePage() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const { connectionStatus, loading, roomNotFound, room, players, answers, teams, teamAnswers, questionList, lobbyStage } =
    useGameRoom({
      roomCode,
      self: null,
    });

  // Called unconditionally, before the early returns below, per the
  // Rules of Hooks - `room` may still be null this early.
  const remainingSeconds = useCountdown(
    room?.timerStatus ?? "not_started",
    room?.timerStartedAt ?? null,
    room?.timerRemainingSeconds ?? null,
  );

  if (connectionStatus === "unconfigured") {
    return (
      <div className="stage">
        <p className="stage-status" role="status">
          Not connected — see the setup notice above
        </p>
      </div>
    );
  }

  if (loading) {
    return <LoadingScreen message="Loading stage..." />;
  }

  if (roomNotFound || !room) {
    return (
      <div className="stage">
        <h1>We couldn&rsquo;t find that room</h1>
        <p className="stage-status">Double-check the room code with your host.</p>
        <Link to="/" className="btn btn-ghost">
          Back to home
        </Link>
      </div>
    );
  }

  const question = getQuestionById(questionList, room.currentQuestionId);
  const sectionInfo =
    room.deckSnapshot?.kind === "game_plan" ? findSectionForQuestion(room.deckSnapshot, room.currentQuestionId) : null;
  const questionTimerSeconds = room.deckSnapshot?.questionTimerSeconds ?? null;
  const isTeamMode = room.competitionStyle === "team";
  const scorablePlayers = players.filter((player) => !player.isHost);
  const competitors: Competitor[] = isTeamMode
    ? teams.map(teamToCompetitor)
    : scorablePlayers.map(playerToCompetitor);
  const joinUrl = buildJoinUrl(window.location.origin, roomCode);

  return (
    <div className="stage">
      {room.phase === "lobby" && lobbyStage === "invite" && (
        <div className="stage-lobby-card">
          <div className="stage-lobby-join">
            <h1>Scan to Join</h1>
            <div className="stage-qr">
              <RoomQrCode joinUrl={joinUrl} size={160} />
            </div>
            <p className="stage-room-code">
              Room Code: <strong>{roomCode}</strong>
            </p>
          </div>

          <div className="stage-lobby-players">
            <p className="stage-eyebrow">Players Joining</p>
            {scorablePlayers.length > 0 && (
              <div className="stage-avatar-row" aria-hidden="true">
                {scorablePlayers.slice(0, STAGE_AVATAR_VISIBLE_LIMIT).map((player) => (
                  <span key={player.clientId}>{avatarForClientId(player.clientId)}</span>
                ))}
              </div>
            )}
            <div role="status">
              <p className="stage-player-count">
                {scorablePlayers.length} Player{scorablePlayers.length === 1 ? "" : "s"} Connected
              </p>
              <p className="stage-status">
                {scorablePlayers.length === 0 ? "Waiting for players to join..." : "Waiting for the host to begin..."}
              </p>
            </div>
          </div>
        </div>
      )}

      {room.phase === "lobby" && lobbyStage !== "invite" && (
        <>
          <h1>Room {roomCode}</h1>
          {isTeamMode ? (
            <p className="stage-status" role="status">
              {teams.length === 0
                ? "Waiting for teams to form..."
                : `${teams.length} team${teams.length === 1 ? "" : "s"} joined`}
            </p>
          ) : (
            <p className="stage-status" role="status">
              Waiting for the host to start...
            </p>
          )}
          <GameSetupSummary deckSnapshot={room.deckSnapshot} competitionStyle={room.competitionStyle} />
        </>
      )}

      {room.phase === "question" && question && (
        <>
          <p className="stage-eyebrow">
            {sectionInfo
              ? `${sectionInfo.section.deckTitle} — Deck ${sectionInfo.sectionNumber} of ${sectionInfo.totalSections}`
              : `Question ${questionNumber(question.id)}`}
          </p>
          <h1>{question.prompt}</h1>
          {question.answerMethod === "multiple_choice" && (
            <div className="stage-options">
              {question.options.map((option, index) => (
                <div key={option.id} className="stage-option">
                  <span className="stage-option-letter">{String.fromCharCode(65 + index)}</span>
                  {option.text}
                </div>
              ))}
            </div>
          )}
          {questionTimerSeconds !== null && room.timerStatus === "expired" && <p className="stage-timer-expired">TIME&rsquo;S UP</p>}
          {questionTimerSeconds !== null && room.timerStatus !== "expired" && remainingSeconds !== null && (
            <p className="stage-status" role="status">
              ⏱ {formatCountdown(remainingSeconds)}
              {room.timerStatus === "paused" && " — Timer paused by Host"}
            </p>
          )}
        </>
      )}

      {room.phase === "question" && !question && (
        <p className="stage-status" role="status">
          Catching up with the current Question…
        </p>
      )}

      {room.phase === "reveal" && question && (
        <>
          <p className="stage-eyebrow">Reveal</p>
          <h1>
            The answer was{" "}
            {question.answerMethod === "multiple_choice"
              ? question.options.find((option) => option.id === question.correctOptionId)?.text
              : question.correctAnswer}
          </h1>
          <StageAggregate answers={isTeamMode ? teamAnswers : answers} />
        </>
      )}

      {room.phase === "reveal" && !question && (
        <p className="stage-status" role="status">
          Catching up with the reveal…
        </p>
      )}

      {(room.phase === "leaderboard" || room.phase === "ended") && (
        <>
          <p className="stage-eyebrow">{room.phase === "ended" ? "Final Standings" : "Standings"}</p>
          {room.phase === "ended" && <StageWinner competitors={competitors} winnerIds={room.winnerIds} />}
          <CompetitorLeaderboard
            competitors={competitors}
            emptyMessage={isTeamMode ? "No teams to show yet." : "No players to show yet."}
          />
        </>
      )}
    </div>
  );
}

function StageAggregate({ answers }: { answers: GradedLike[] }) {
  const aggregate = computeAggregateReveal(answers);

  if (aggregate.answeredCount === 0) {
    return <p className="stage-status">Nobody answered this one</p>;
  }

  if (aggregate.pendingCount > 0) {
    return <p className="stage-status">Some answers are still being checked.</p>;
  }

  return (
    <p className="stage-status">
      {aggregate.correctCount} of {aggregate.correctCount + aggregate.incorrectCount} got it right (
      {aggregate.percentageCorrect}%)
    </p>
  );
}

function StageWinner({ competitors, winnerIds }: { competitors: Competitor[]; winnerIds: string[] }) {
  const winners = computeWinners(competitors).filter((competitor) => winnerIds.includes(competitor.id));
  if (winners.length === 0) return null;

  return (
    <h1 className="stage-winner">
      🎉 {winners.map((competitor) => competitor.displayName).join(" & ")}{" "}
      {winners.length === 1 ? "wins!" : "win!"}
    </h1>
  );
}

export default StagePage;
