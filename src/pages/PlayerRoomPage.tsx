import { useEffect, useMemo, useRef } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useClientId } from "../hooks/useClientId";
import { useRoomChannel } from "../hooks/useRoomChannel";
import { useGameRoom } from "../hooks/useGameRoom";
import { getQuestionById, type Question } from "../data/questions";
import { isAnswerCorrect, sortLeaderboard } from "../utils/scoring";
import PlayerList from "../components/PlayerList";
import LoadingScreen from "../components/LoadingScreen";
import type { RoomPlayer } from "../types/room";
import type { PlayerRecord } from "../types/game";
import "./PlayerRoomPage.css";

const DISPLAY_NAME_KEY = "trivia-night:display-name";

/**
 * Guards on having a display name before connecting to the room - a
 * direct link/refresh with no name on file sends the player back to the
 * join form instead of joining anonymously.
 */
function PlayerRoomPage() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const clientId = useClientId();
  const displayName = sessionStorage.getItem(DISPLAY_NAME_KEY);

  const self = useMemo<RoomPlayer | null>(
    () => (displayName ? { clientId, displayName, isHost: false, joinedAt: Date.now() } : null),
    [clientId, displayName],
  );

  if (!self) {
    return <Navigate to={`/join?room=${roomCode}`} replace />;
  }

  return <PlayerRoomContent roomCode={roomCode} self={self} />;
}

function describeStatus(status: string): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "unconfigured":
      return "Not connected — see the setup notice above";
    case "disconnected":
      return "Connection lost — reconnecting...";
    default:
      return "Connecting...";
  }
}

function PlayerRoomContent({ roomCode, self }: { roomCode: string; self: RoomPlayer }) {
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
    myAnswerOptionId,
    submitAnswer,
  } = useGameRoom({ roomCode, self });

  const hostPresent = presencePlayers.some((player) => player.isHost);
  const otherPlayers = presencePlayers.filter((player) => player.clientId !== self.clientId);

  // A fresh join into a game already past "lobby" is a late join for
  // *that* game instance, not for whichever game comes after Play Again.
  const hasCapturedInitialState = useRef(false);
  const lateJoinInstanceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!loading && room && !hasCapturedInitialState.current) {
      hasCapturedInitialState.current = true;
      if (room.phase !== "lobby") {
        lateJoinInstanceRef.current = room.gameInstanceId;
      }
    }
  }, [loading, room]);

  const isLateJoin =
    !!room && room.phase !== "lobby" && lateJoinInstanceRef.current === room.gameInstanceId;

  if (connectionStatus === "unconfigured" || presenceStatus === "unconfigured") {
    return (
      <div className="player-room">
        <p className="player-room-status">{describeStatus("unconfigured")}</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingScreen message="Joining room..." />;
  }

  if (roomNotFound || !room) {
    return (
      <div className="player-room">
        <h1>Room not found</h1>
        <p className="player-room-status">Double check the room code and try again.</p>
      </div>
    );
  }

  if (isLateJoin) {
    return (
      <div className="player-room">
        <p className="player-room-status">{describeStatus(connectionStatus)}</p>
        <h1>The game has already started.</h1>
        <p>You&rsquo;ll join when the next game begins.</p>
      </div>
    );
  }

  const question = getQuestionById(room.currentQuestionId);
  const scorablePlayers = players.filter((player) => !player.isHost);

  return (
    <div className="player-room">
      <p className="player-room-status">
        {connectionStatus === "connected" ? `You're in! Room ${roomCode}` : describeStatus(connectionStatus)}
      </p>

      {room.phase === "lobby" && (
        <>
          <h1>Waiting for the host to start...</h1>
          {connectionStatus === "connected" && !hostPresent && (
            <p className="player-room-warning">
              We haven&rsquo;t seen the host yet - double check the room code.
            </p>
          )}
          <div className="player-room-roster">
            <h2>Also here</h2>
            <PlayerList players={otherPlayers} emptyMessage="You're the first one here!" />
          </div>
        </>
      )}

      {room.phase === "question" && question && (
        <QuestionAnswering
          question={question}
          selectedOptionId={myAnswerOptionId}
          onSelect={(optionId) => void submitAnswer(optionId)}
        />
      )}

      {room.phase === "reveal" && question && (
        <RevealResult question={question} myAnswerOptionId={myAnswerOptionId} />
      )}

      {room.phase === "leaderboard" && <LeaderboardView players={scorablePlayers} self={self} />}

      {room.phase === "ended" && (
        <EndedView players={scorablePlayers} winnerClientIds={room.winnerClientIds} self={self} />
      )}
    </div>
  );
}

function QuestionAnswering({
  question,
  selectedOptionId,
  onSelect,
}: {
  question: Question;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
}) {
  return (
    <div className="player-question">
      <h1>{question.prompt}</h1>
      <div className="player-options" role="radiogroup" aria-label="Answer choices">
        {question.options.map((option) => {
          const selected = option.id === selectedOptionId;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`player-option${selected ? " player-option-selected" : ""}`}
              onClick={() => onSelect(option.id)}
            >
              <span className="player-option-letter">{option.id}</span>
              {option.text}
            </button>
          );
        })}
      </div>
      {selectedOptionId ? (
        <p className="player-room-status">Recorded — you can change this until the reveal.</p>
      ) : (
        <p className="player-room-status">Tap an answer to lock it in.</p>
      )}
    </div>
  );
}

function RevealResult({
  question,
  myAnswerOptionId,
}: {
  question: Question;
  myAnswerOptionId: string | null;
}) {
  const correctOption = question.options.find((option) => option.id === question.correctOptionId);
  const wasCorrect = isAnswerCorrect(myAnswerOptionId ?? undefined, question);

  return (
    <div className="player-reveal">
      <h1>{wasCorrect ? "Correct! ✓" : myAnswerOptionId ? "Not this time" : "You didn't answer"}</h1>
      <p>The answer was {correctOption?.text}.</p>
    </div>
  );
}

function LeaderboardView({ players, self }: { players: PlayerRecord[]; self: RoomPlayer }) {
  const ranked = sortLeaderboard(players);

  return (
    <div className="player-leaderboard">
      <h1>Standings</h1>
      <ol className="player-leaderboard-list">
        {ranked.map((player, index) => (
          <li key={player.clientId} className={player.clientId === self.clientId ? "player-leaderboard-self" : ""}>
            <span>{index + 1}</span>
            <span className="player-leaderboard-name">{player.displayName}</span>
            <span>{player.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EndedView({
  players,
  winnerClientIds,
  self,
}: {
  players: PlayerRecord[];
  winnerClientIds: string[];
  self: RoomPlayer;
}) {
  const ranked = sortLeaderboard(players);
  const myRank = ranked.findIndex((player) => player.clientId === self.clientId) + 1;
  const myScore = ranked.find((player) => player.clientId === self.clientId)?.score ?? 0;
  const iWon = winnerClientIds.includes(self.clientId);

  return (
    <div className="player-ended">
      <h1>{iWon ? "You won! 🎉" : "Game over"}</h1>
      {myRank > 0 && (
        <p>
          You finished #{myRank} with {myScore} points.
        </p>
      )}
      <p className="player-room-status">Waiting for the host...</p>
    </div>
  );
}

export default PlayerRoomPage;
