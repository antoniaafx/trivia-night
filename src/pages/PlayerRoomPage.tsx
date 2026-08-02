import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useClientId } from "../hooks/useClientId";
import { useRoomChannel } from "../hooks/useRoomChannel";
import { useGameRoom } from "../hooks/useGameRoom";
import { getQuestionById, type Question } from "../data/questions";
import { computeWinners, isAnswerCorrect, validateTeamName } from "../utils/scoring";
import PlayerList from "../components/PlayerList";
import LoadingScreen from "../components/LoadingScreen";
import CompetitorLeaderboard from "../components/CompetitorLeaderboard";
import type { RoomPlayer } from "../types/room";
import type { Competitor, TeamRecord } from "../types/game";
import { playerToCompetitor, teamToCompetitor } from "../types/game";
import "./PlayerRoomPage.css";

const DISPLAY_NAME_KEY = "trivia-night:display-name";
const KNOWN_INSTANCE_KEY_PREFIX = "trivia-night:known-instance:";

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
    teams,
    myAnswerOptionId,
    myTeamId,
    myTeamAnswerOptionId,
    createTeam,
    joinTeam,
    leaveTeam,
    submitAnswer,
    submitTeamAnswer,
  } = useGameRoom({ roomCode, self });

  const hostPresent = presencePlayers.some((player) => player.isHost);
  const otherPlayers = presencePlayers.filter((player) => player.clientId !== self.clientId);

  // A late join means never having been present for *this* game
  // instance's lobby - not merely loading the page while some phase
  // other than lobby happens to be active. sessionStorage (not a ref)
  // is what makes this survive a refresh: a returning player recorded
  // this instance id the last time they saw its lobby, before whatever
  // caused the refresh: a ref would forget that on every fresh mount
  // and misidentify every reconnect as a late join.
  const [isLateJoin, setIsLateJoin] = useState(false);

  useEffect(() => {
    if (loading || !room) return;
    const key = `${KNOWN_INSTANCE_KEY_PREFIX}${roomCode}`;

    if (room.phase === "lobby") {
      sessionStorage.setItem(key, room.gameInstanceId);
      setIsLateJoin(false);
      return;
    }

    setIsLateJoin(sessionStorage.getItem(key) !== room.gameInstanceId);
  }, [loading, room, roomCode]);

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
  const isTeamMode = room.competitionStyle === "team";
  const scorablePlayers = players.filter((player) => !player.isHost);
  const competitors: Competitor[] = isTeamMode
    ? teams.map(teamToCompetitor)
    : scorablePlayers.map(playerToCompetitor);
  const myCompetitorId = isTeamMode ? myTeamId : self.clientId;
  const unitLabel = isTeamMode ? "team" : "you";

  return (
    <div className="player-room">
      <p className="player-room-status">
        {connectionStatus === "connected" ? `You're in! Room ${roomCode}` : describeStatus(connectionStatus)}
      </p>

      {room.phase === "lobby" &&
        (isTeamMode ? (
          <>
            {connectionStatus === "connected" && !hostPresent && (
              <p className="player-room-warning">
                We haven&rsquo;t seen the host yet - double check the room code.
              </p>
            )}
            <TeamSelector
              teams={teams}
              myTeamId={myTeamId}
              onJoin={joinTeam}
              onLeave={leaveTeam}
              onCreate={createTeam}
            />
          </>
        ) : (
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
        ))}

      {room.phase === "question" && question && (
        <QuestionAnswering
          question={question}
          isTeamMode={isTeamMode}
          hasTeam={!isTeamMode || myTeamId !== null}
          selectedOptionId={isTeamMode ? myTeamAnswerOptionId : myAnswerOptionId}
          onSelect={(optionId) => void (isTeamMode ? submitTeamAnswer(optionId) : submitAnswer(optionId))}
        />
      )}

      {room.phase === "reveal" && question && (
        <RevealResult
          question={question}
          isTeamMode={isTeamMode}
          myAnswerOptionId={isTeamMode ? myTeamAnswerOptionId : myAnswerOptionId}
        />
      )}

      {room.phase === "leaderboard" && (
        <div className="player-leaderboard">
          <h1>Standings</h1>
          <CompetitorLeaderboard competitors={competitors} highlightId={myCompetitorId} />
        </div>
      )}

      {room.phase === "ended" && (
        <EndedView
          competitors={competitors}
          winnerIds={room.winnerIds}
          myCompetitorId={myCompetitorId}
          unitLabel={unitLabel}
        />
      )}
    </div>
  );
}

function TeamSelector({
  teams,
  myTeamId,
  onJoin,
  onLeave,
  onCreate,
}: {
  teams: TeamRecord[];
  myTeamId: string | null;
  onJoin: (teamId: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onCreate: (name: string) => Promise<TeamRecord>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myTeam = teams.find((team) => team.id === myTeamId) ?? null;

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const validation = validateTeamName(name);
    if (!validation.valid) {
      setError(validation.reason);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate(name);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that team. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(teamId: string) {
    setBusy(true);
    setError(null);
    try {
      await onJoin(teamId);
    } catch {
      setError("Couldn't join that team. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    setBusy(true);
    setError(null);
    try {
      await onLeave();
    } catch {
      setError("Couldn't leave that team. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (myTeam) {
    const otherTeams = teams.filter((team) => team.id !== myTeam.id);
    return (
      <div className="player-team-select">
        <h1>You&rsquo;re on {myTeam.name}</h1>
        <p className="player-room-status">You can switch teams until the host starts the game.</p>
        {error && (
          <p className="player-room-warning" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => void handleLeave()} disabled={busy}>
          Leave team
        </button>
        {otherTeams.length > 0 && (
          <div className="player-team-list">
            <h2>Switch to another team</h2>
            <ul>
              {otherTeams.map((team) => (
                <li key={team.id}>
                  <button
                    type="button"
                    className="player-team-item"
                    onClick={() => void handleJoin(team.id)}
                    disabled={busy}
                  >
                    {team.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="player-team-select">
      <h1>Choose a team</h1>
      {error && (
        <p className="player-room-warning" role="alert">
          {error}
        </p>
      )}
      {teams.length > 0 && (
        <div className="player-team-list">
          <ul>
            {teams.map((team) => (
              <li key={team.id}>
                <button
                  type="button"
                  className="player-team-item"
                  onClick={() => void handleJoin(team.id)}
                  disabled={busy}
                >
                  {team.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form className="player-team-create" onSubmit={(event) => void handleCreate(event)}>
        <label htmlFor="new-team-name">Create a new team</label>
        <input
          id="new-team-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={30}
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Create team
        </button>
      </form>
    </div>
  );
}

function QuestionAnswering({
  question,
  isTeamMode,
  hasTeam,
  selectedOptionId,
  onSelect,
}: {
  question: Question;
  isTeamMode: boolean;
  hasTeam: boolean;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
}) {
  return (
    <div className="player-question">
      <h1>{question.prompt}</h1>
      {isTeamMode && !hasTeam ? (
        <p className="player-room-warning">You didn&rsquo;t join a team before the game started.</p>
      ) : (
        <>
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
            <p className="player-room-status" role="status">
              {isTeamMode ? "Team answer updated — anyone on your team can change this until the reveal." : "Recorded — you can change this until the reveal."}
            </p>
          ) : (
            <p className="player-room-status">
              {isTeamMode ? "Tap an answer to lock it in for your team." : "Tap an answer to lock it in."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function RevealResult({
  question,
  isTeamMode,
  myAnswerOptionId,
}: {
  question: Question;
  isTeamMode: boolean;
  myAnswerOptionId: string | null;
}) {
  const correctOption = question.options.find((option) => option.id === question.correctOptionId);
  const wasCorrect = isAnswerCorrect(myAnswerOptionId ?? undefined, question);

  const heading = wasCorrect
    ? isTeamMode
      ? "Your team got it! ✓"
      : "Correct! ✓"
    : myAnswerOptionId
      ? "Not this time"
      : isTeamMode
        ? "Your team didn't answer"
        : "You didn't answer";

  return (
    <div className="player-reveal">
      <h1>{heading}</h1>
      <p>The answer was {correctOption?.text}.</p>
    </div>
  );
}

function EndedView({
  competitors,
  winnerIds,
  myCompetitorId,
  unitLabel,
}: {
  competitors: Competitor[];
  winnerIds: string[];
  myCompetitorId: string | null;
  unitLabel: string;
}) {
  const winners = computeWinners(competitors).filter((competitor) => winnerIds.includes(competitor.id));
  const mine = competitors.find((competitor) => competitor.id === myCompetitorId) ?? null;
  const iWon = myCompetitorId !== null && winnerIds.includes(myCompetitorId);
  const myRank = mine ? [...competitors].sort((a, b) => b.score - a.score).indexOf(mine) + 1 : 0;

  return (
    <div className="player-ended">
      <h1>{iWon ? "You won! 🎉" : "Game over"}</h1>
      {!iWon && winners.length > 0 && (
        <p className="player-room-status">
          {winners.length === 1 ? `${winners[0].displayName} wins!` : `${winners.map((w) => w.displayName).join(", ")} tie for the win!`}
        </p>
      )}
      {mine && myRank > 0 && (
        <p>
          {unitLabel === "team" ? "Your team finished" : "You finished"} #{myRank} with {mine.score} points.
        </p>
      )}
      <CompetitorLeaderboard competitors={competitors} highlightId={myCompetitorId} />
      <p className="player-room-status">Waiting for the host...</p>
    </div>
  );
}

export default PlayerRoomPage;
