import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useClientId } from "../hooks/useClientId";
import { useRoomChannel } from "../hooks/useRoomChannel";
import { useGameRoom } from "../hooks/useGameRoom";
import { getQuestionById, type Question } from "../data/questions";
import { computeAggregateReveal, computeWinners } from "../utils/scoring";
import PlayerList from "../components/PlayerList";
import LoadingScreen from "../components/LoadingScreen";
import CompetitorLeaderboard from "../components/CompetitorLeaderboard";
import type { RoomPlayer } from "../types/room";
import type {
  AnswerRecord,
  CompetitionStyle,
  Competitor,
  PlayerRecord,
  TeamRecord,
} from "../types/game";
import { playerToCompetitor, teamToCompetitor } from "../types/game";
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
    teams,
    teamAnswers,
    setCompetitionStyle,
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
  const isTeamMode = room.competitionStyle === "team";
  const competitors: Competitor[] = isTeamMode
    ? teams.map(teamToCompetitor)
    : scorablePlayers.map(playerToCompetitor);
  const unitLabel = isTeamMode ? "team" : "player";
  const answeredCount = isTeamMode ? teamAnswers.length : answers.length;
  const totalCompetitors = isTeamMode ? teams.length : scorablePlayers.length;

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
        <LobbyPhase
          competitionStyle={room.competitionStyle}
          isLocked={scorablePlayers.length > 0}
          onChangeStyle={(style) => void setCompetitionStyle(style)}
          joinedPlayers={joinedPlayers}
          teams={teams}
          teamPlayers={scorablePlayers}
          onStart={() => void startGame()}
        />
      )}

      {room.phase === "question" && question && (
        <QuestionPhase
          question={question}
          answeredCount={answeredCount}
          totalCompetitors={totalCompetitors}
          unitLabel={unitLabel}
          onReveal={() => void revealAnswer()}
        />
      )}

      {room.phase === "reveal" && question && (
        <RevealPhase
          question={question}
          answers={isTeamMode ? teamAnswers : answers}
          onShowLeaderboard={() => void showLeaderboard()}
        />
      )}

      {room.phase === "leaderboard" && (
        <LeaderboardPhase competitors={competitors} unitLabel={unitLabel} onShowWinner={() => void showWinner()} />
      )}

      {room.phase === "ended" && (
        <EndedPhase
          competitors={competitors}
          unitLabel={unitLabel}
          winnerIds={room.winnerIds}
          onPlayAgain={() => void playAgain()}
        />
      )}
    </div>
  );
}

function CompetitionStylePicker({
  value,
  locked,
  onChange,
}: {
  value: CompetitionStyle;
  locked: boolean;
  onChange: (style: CompetitionStyle) => void;
}) {
  const [rejected, setRejected] = useState(false);

  function handleChange(style: CompetitionStyle) {
    setRejected(false);
    onChange(style);
  }

  return (
    <fieldset className="host-style-picker" disabled={locked}>
      <legend>Competition Style</legend>
      <label>
        <input
          type="radio"
          name="competition-style"
          value="team"
          checked={value === "team"}
          onChange={() => handleChange("team")}
        />
        Team Play
      </label>
      <label>
        <input
          type="radio"
          name="competition-style"
          value="solo"
          checked={value === "solo"}
          onChange={() => handleChange("solo")}
        />
        Solo Play
      </label>
      {locked && <p className="host-style-note">Competition style is locked after players join.</p>}
      {rejected && (
        <p className="host-style-note" role="alert">
          Someone just joined — competition style is now locked.
        </p>
      )}
    </fieldset>
  );
}

function LobbyPhase({
  competitionStyle,
  isLocked,
  onChangeStyle,
  joinedPlayers,
  teams,
  teamPlayers,
  onStart,
}: {
  competitionStyle: CompetitionStyle;
  isLocked: boolean;
  onChangeStyle: (style: CompetitionStyle) => void;
  joinedPlayers: RoomPlayer[];
  teams: TeamRecord[];
  teamPlayers: PlayerRecord[];
  onStart: () => void;
}) {
  const startHint =
    competitionStyle === "team"
      ? teams.length === 0
        ? "Waiting for teams to form..."
        : teams.length === 1
          ? "1 team joined. You can start now or wait for more players."
          : `${teams.length} teams joined. Start whenever you're ready.`
      : null;

  return (
    <>
      <CompetitionStylePicker value={competitionStyle} locked={isLocked} onChange={onChangeStyle} />

      {competitionStyle === "team" ? (
        <TeamRoster teams={teams} players={teamPlayers} />
      ) : (
        <div className="host-lobby-roster">
          <h2>
            {joinedPlayers.length} player{joinedPlayers.length === 1 ? "" : "s"} joined
          </h2>
          <PlayerList players={joinedPlayers} emptyMessage="Waiting for players to join..." />
        </div>
      )}

      {startHint && <p className="host-answered-count">{startHint}</p>}
      <button type="button" className="btn btn-primary" onClick={onStart}>
        Start Game
      </button>
    </>
  );
}

function TeamRoster({ teams, players }: { teams: TeamRecord[]; players: PlayerRecord[] }) {
  const unassigned = players.filter((player) => player.teamId === null);

  return (
    <div className="host-lobby-roster">
      <h2>
        {teams.length} team{teams.length === 1 ? "" : "s"}
      </h2>
      {teams.length === 0 ? (
        <p className="competitor-leaderboard-empty">Waiting for teams to form...</p>
      ) : (
        <ul className="host-team-roster">
          {teams.map((team) => (
            <li key={team.id}>
              <p className="host-team-roster-name">{team.name}</p>
              <ul className="host-team-roster-members">
                {players
                  .filter((player) => player.teamId === team.id)
                  .map((player) => (
                    <li key={player.clientId}>{player.displayName}</li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {unassigned.length > 0 && (
        <p className="host-lobby-status">
          {unassigned.length} player{unassigned.length === 1 ? "" : "s"} still choosing a team
        </p>
      )}
    </div>
  );
}

function QuestionPhase({
  question,
  answeredCount,
  totalCompetitors,
  unitLabel,
  onReveal,
}: {
  question: Question;
  answeredCount: number;
  totalCompetitors: number;
  unitLabel: string;
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
        {answeredCount} of {totalCompetitors} {unitLabel}
        {totalCompetitors === 1 ? "" : "s"} answered
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
  answers: AnswerRecord[] | { optionId: string }[];
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
  competitors,
  unitLabel,
  onShowWinner,
}: {
  competitors: Competitor[];
  unitLabel: string;
  onShowWinner: () => void;
}) {
  return (
    <div className="host-phase card">
      <p className="host-phase-label">Leaderboard</p>
      <CompetitorLeaderboard competitors={competitors} emptyMessage={`No ${unitLabel}s to show yet.`} />
      <button type="button" className="btn btn-primary" onClick={onShowWinner}>
        Show Winner
      </button>
    </div>
  );
}

function EndedPhase({
  competitors,
  unitLabel,
  winnerIds,
  onPlayAgain,
}: {
  competitors: Competitor[];
  unitLabel: string;
  winnerIds: string[];
  onPlayAgain: () => void;
}) {
  const winners = computeWinners(competitors).filter((competitor) => winnerIds.includes(competitor.id));

  return (
    <div className="host-phase card">
      <p className="host-phase-label">Winner</p>
      <h2>
        {winners.length === 0
          ? `No ${unitLabel}s took part`
          : winners.length === 1
            ? `${winners[0].displayName} wins!`
            : `${winners.map((competitor) => competitor.displayName).join(", ")} tie for the win!`}
      </h2>
      <CompetitorLeaderboard competitors={competitors} emptyMessage={`No ${unitLabel}s to show yet.`} />
      <button type="button" className="btn btn-primary" onClick={onPlayAgain}>
        Play Again
      </button>
    </div>
  );
}

export default HostControlPanelPage;
