import { useParams } from "react-router-dom";
import { useGameRoom } from "../hooks/useGameRoom";
import { getQuestionById, type Question } from "../data/questions";
import { computeAggregateReveal, sortLeaderboard } from "../utils/scoring";
import LoadingScreen from "../components/LoadingScreen";
import type { AnswerRecord, PlayerRecord } from "../types/game";
import "./StagePage.css";

/**
 * The shared display. Read-only by design: no host controls render
 * here under any circumstance, and it never shows anything a host
 * hasn't already revealed to the room (no correct answer during the
 * question phase, no per-player answers ever).
 */
function StagePage() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const { connectionStatus, loading, roomNotFound, room, players, answers } = useGameRoom({
    roomCode,
    self: null,
  });

  if (connectionStatus === "unconfigured") {
    return (
      <div className="stage">
        <p className="stage-status">Not connected — see the setup notice above</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingScreen message="Loading stage..." />;
  }

  if (roomNotFound || !room) {
    return (
      <div className="stage">
        <h1>Room not found</h1>
        <p className="stage-status">Check the room code and open this page again.</p>
      </div>
    );
  }

  const question = getQuestionById(room.currentQuestionId);
  const scorablePlayers = players.filter((player) => !player.isHost);

  return (
    <div className="stage">
      {room.phase === "lobby" && (
        <>
          <h1>Room {roomCode}</h1>
          <p className="stage-status">Waiting for the host to start...</p>
        </>
      )}

      {room.phase === "question" && question && (
        <>
          <p className="stage-eyebrow">Question 1</p>
          <h1>{question.prompt}</h1>
          <div className="stage-options">
            {question.options.map((option) => (
              <div key={option.id} className="stage-option">
                <span className="stage-option-letter">{option.id}</span>
                {option.text}
              </div>
            ))}
          </div>
        </>
      )}

      {room.phase === "reveal" && question && (
        <>
          <p className="stage-eyebrow">Reveal</p>
          <h1>
            The answer was{" "}
            {question.options.find((option) => option.id === question.correctOptionId)?.text}
          </h1>
          <StageAggregate answers={answers} question={question} />
        </>
      )}

      {(room.phase === "leaderboard" || room.phase === "ended") && (
        <>
          <p className="stage-eyebrow">{room.phase === "ended" ? "Final Standings" : "Standings"}</p>
          {room.phase === "ended" && <StageWinner players={scorablePlayers} winnerClientIds={room.winnerClientIds} />}
          <ol className="stage-leaderboard">
            {sortLeaderboard(scorablePlayers).map((player, index) => (
              <li key={player.clientId}>
                <span>{index + 1}</span>
                <span className="stage-leaderboard-name">{player.displayName}</span>
                <span>{player.score}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function StageAggregate({ answers, question }: { answers: AnswerRecord[]; question: Question }) {
  const aggregate = computeAggregateReveal(answers, question);
  return (
    <p className="stage-status">
      {aggregate.answeredCount === 0
        ? "Nobody answered this one"
        : `${aggregate.correctCount} of ${aggregate.answeredCount} got it right (${aggregate.percentageCorrect}%)`}
    </p>
  );
}

function StageWinner({ players, winnerClientIds }: { players: PlayerRecord[]; winnerClientIds: string[] }) {
  const winners = players.filter((player) => winnerClientIds.includes(player.clientId));
  if (winners.length === 0) return null;

  return (
    <h1 className="stage-winner">
      🎉 {winners.map((player) => player.displayName).join(" & ")}{" "}
      {winners.length === 1 ? "wins!" : "win!"}
    </h1>
  );
}

export default StagePage;
