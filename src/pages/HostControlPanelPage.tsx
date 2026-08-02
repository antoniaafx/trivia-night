import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useClientId } from "../hooks/useClientId";
import { useRoomChannel } from "../hooks/useRoomChannel";
import { useGameRoom } from "../hooks/useGameRoom";
import { getQuestionById, type Question } from "../data/questions";
import { computeAggregateReveal, sortLeaderboard } from "../utils/scoring";
import PlayerList from "../components/PlayerList";
import LoadingScreen from "../components/LoadingScreen";
import type { RoomPlayer } from "../types/room";
import type { AnswerRecord, PlayerRecord } from "../types/game";
import "./HostControlPanelPage.css";

function describeStatus(status: string): string {
  switch (status) {
    case "connected":
      return "Room is live";
    case "unconfigured":
      return "Not connected — see the setup notice above";
    case "disconnected":
      return "Connection lost — reconnecting...";
    default:
      return "Connecting...";
  }
}

function HostControlPanelPage() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const clientId = useClientId();

  const self = useMemo<RoomPlayer>(
    () => ({ clientId, displayName: "Host", isHost: true, joinedAt: Date.now() }),
    [clientId],
  );

  const { players: presencePlayers, connectionStatus: presenceStatus } = useRoomChannel({
    roomCode,
    self,
  });

  const {
    connectionStatus,
    loading,
    roomNotFound,
    room,
    players,
    answers,
    startGame,
    revealAnswer,
    showLeaderboard,
    showWinner,
    playAgain,
  } = useGameRoom({ roomCode, self });

  const joinUrl = `${window.location.origin}/join?room=${roomCode}`;
  const stageUrl = `${window.location.origin}/stage/${roomCode}`;
  const joinedPlayers = presencePlayers.filter((player) => !player.isHost);
  const scorablePlayers = players.filter((player) => !player.isHost);

  if (connectionStatus === "unconfigured" || presenceStatus === "unconfigured") {
    return (
      <div className="host-lobby">
        <p className="host-lobby-status">{describeStatus("unconfigured")}</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingScreen message="Loading room..." />;
  }

  if (roomNotFound || !room) {
    return (
      <div className="host-lobby">
        <p className="host-lobby-status">Something went wrong creating this room.</p>
      </div>
    );
  }

  const question = getQuestionById(room.currentQuestionId);

  return (
    <div className="host-lobby">
      <div className="host-lobby-invite card">
        <QRCodeSVG value={joinUrl} size={180} bgColor="transparent" fgColor="#f5f3ff" />
        <p className="host-lobby-code">
          Room code: <strong>{roomCode}</strong>
        </p>
        <p className="host-lobby-status">{describeStatus(connectionStatus)}</p>
        <a href={stageUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
          Open Stage
        </a>
      </div>

      {room.phase === "lobby" && (
        <LobbyPhase joinedPlayers={joinedPlayers} onStart={() => void startGame()} />
      )}

      {room.phase === "question" && question && (
        <QuestionPhase
          question={question}
          answeredCount={answers.length}
          totalPlayers={scorablePlayers.length}
          onReveal={() => void revealAnswer()}
        />
      )}

      {room.phase === "reveal" && question && (
        <RevealPhase
          question={question}
          answers={answers}
          onShowLeaderboard={() => void showLeaderboard()}
        />
      )}

      {room.phase === "leaderboard" && (
        <LeaderboardPhase players={scorablePlayers} onShowWinner={() => void showWinner()} />
      )}

      {room.phase === "ended" && (
        <EndedPhase
          players={scorablePlayers}
          winnerClientIds={room.winnerClientIds}
          onPlayAgain={() => void playAgain()}
        />
      )}
    </div>
  );
}

function LobbyPhase({
  joinedPlayers,
  onStart,
}: {
  joinedPlayers: RoomPlayer[];
  onStart: () => void;
}) {
  return (
    <>
      <div className="host-lobby-roster">
        <h2>
          {joinedPlayers.length} player{joinedPlayers.length === 1 ? "" : "s"} joined
        </h2>
        <PlayerList players={joinedPlayers} emptyMessage="Waiting for players to join..." />
      </div>
      <button type="button" className="btn btn-primary" onClick={onStart}>
        Start Game
      </button>
    </>
  );
}

function QuestionPhase({
  question,
  answeredCount,
  totalPlayers,
  onReveal,
}: {
  question: Question;
  answeredCount: number;
  totalPlayers: number;
  onReveal: () => void;
}) {
  return (
    <div className="host-phase card">
      <p className="host-phase-label">Question</p>
      <h2>{question.prompt}</h2>
      <ul className="host-options">
        {question.options.map((option) => (
          <li key={option.id} className={option.id === question.correctOptionId ? "host-options-correct" : ""}>
            {option.id}. {option.text}
            {option.id === question.correctOptionId && " (correct)"}
          </li>
        ))}
      </ul>
      <p className="host-answered-count">
        {answeredCount} of {totalPlayers} player{totalPlayers === 1 ? "" : "s"} answered
      </p>
      <button type="button" className="btn btn-primary" onClick={onReveal}>
        Reveal Answer
      </button>
    </div>
  );
}

function RevealPhase({
  question,
  answers,
  onShowLeaderboard,
}: {
  question: Question;
  answers: AnswerRecord[];
  onShowLeaderboard: () => void;
}) {
  const correctOption = question.options.find((option) => option.id === question.correctOptionId);
  const aggregate = computeAggregateReveal(answers, question);

  return (
    <div className="host-phase card">
      <p className="host-phase-label">Reveal</p>
      <h2>The answer was {correctOption?.text}</h2>
      <p className="host-aggregate">
        {aggregate.correctCount} of {aggregate.answeredCount} correct ({aggregate.percentageCorrect}%)
      </p>
      <button type="button" className="btn btn-primary" onClick={onShowLeaderboard}>
        Show Leaderboard
      </button>
    </div>
  );
}

function LeaderboardPhase({
  players,
  onShowWinner,
}: {
  players: PlayerRecord[];
  onShowWinner: () => void;
}) {
  const ranked = sortLeaderboard(players);

  return (
    <div className="host-phase card">
      <p className="host-phase-label">Leaderboard</p>
      <LeaderboardTable players={ranked} />
      <button type="button" className="btn btn-primary" onClick={onShowWinner}>
        Show Winner
      </button>
    </div>
  );
}

function EndedPhase({
  players,
  winnerClientIds,
  onPlayAgain,
}: {
  players: PlayerRecord[];
  winnerClientIds: string[];
  onPlayAgain: () => void;
}) {
  const ranked = sortLeaderboard(players);
  const winners = ranked.filter((player) => winnerClientIds.includes(player.clientId));

  return (
    <div className="host-phase card">
      <p className="host-phase-label">Winner</p>
      <h2>
        {winners.length === 0
          ? "No players took part"
          : winners.length === 1
            ? `${winners[0].displayName} wins!`
            : `${winners.map((player) => player.displayName).join(", ")} tie for the win!`}
      </h2>
      <LeaderboardTable players={ranked} />
      <button type="button" className="btn btn-primary" onClick={onPlayAgain}>
        Play Again
      </button>
    </div>
  );
}

function LeaderboardTable({ players }: { players: PlayerRecord[] }) {
  if (players.length === 0) {
    return <p className="player-list-empty">No players to show yet.</p>;
  }

  return (
    <ol className="host-leaderboard">
      {players.map((player, index) => (
        <li key={player.clientId}>
          <span className="host-leaderboard-rank">{index + 1}</span>
          <span className="host-leaderboard-name">{player.displayName}</span>
          <span className="host-leaderboard-score">{player.score}</span>
        </li>
      ))}
    </ol>
  );
}

export default HostControlPanelPage;
