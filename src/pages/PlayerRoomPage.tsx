import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useClientId } from "../hooks/useClientId";
import { useRoomChannel } from "../hooks/useRoomChannel";
import { useGameRoom } from "../hooks/useGameRoom";
import { getQuestionById, type Question, type TypedAnswerQuestion } from "../data/questions";
import { computeWinners, validateTeamName } from "../utils/scoring";
import PlayerList from "../components/PlayerList";
import LoadingScreen from "../components/LoadingScreen";
import CompetitorLeaderboard from "../components/CompetitorLeaderboard";
import GameSetupSummary from "../components/GameSetupSummary";
import type { RoomPlayer } from "../types/room";
import type { CompetitionStyle, Competitor, GradingStatus, TeamRecord } from "../types/game";
import { playerToCompetitor, teamToCompetitor } from "../types/game";
import "./PlayerRoomPage.css";

const DISPLAY_NAME_KEY = "trivia-night:display-name";
const KNOWN_INSTANCE_KEY_PREFIX = "trivia-night:known-instance:";
const TYPED_ANSWER_MAX_LENGTH = 200;

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
    myTypedAnswerText,
    myGradingStatus,
    myTeamId,
    myTeamAnswerOptionId,
    myTeamTypedAnswerText,
    myTeamGradingStatus,
    questionList,
    createTeam,
    joinTeam,
    leaveTeam,
    submitAnswer,
    submitTypedAnswer,
    submitTeamAnswer,
    submitTeamTypedAnswer,
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

  // A brief, self-clearing notice for the moment the Host switches
  // Solo/Team mid-Lobby - the lobby UI below already reacts correctly to
  // whichever style is current (team selector vs. plain waiting view),
  // this is only the transient "something just changed" heads-up.
  const previousStyleRef = useRef<CompetitionStyle | null>(null);
  const [styleChangeNotice, setStyleChangeNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!room || room.phase !== "lobby") return;
    const previous = previousStyleRef.current;
    if (previous !== null && previous !== room.competitionStyle) {
      setStyleChangeNotice(
        room.competitionStyle === "team"
          ? "The host switched to Team Play — choose a team to keep playing."
          : "The host switched to Solo Play.",
      );
      previousStyleRef.current = room.competitionStyle;
      const timer = setTimeout(() => setStyleChangeNotice(null), 6000);
      return () => clearTimeout(timer);
    }
    previousStyleRef.current = room.competitionStyle;
    // Deliberately narrower than `room` itself: this should only ever
    // re-run when phase or competitionStyle actually change, not on
    // every unrelated realtime room update (deck_snapshot edits, etc).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.phase, room?.competitionStyle]);

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

  const question = getQuestionById(questionList, room.currentQuestionId);
  const isTeamMode = room.competitionStyle === "team";
  const scorablePlayers = players.filter((player) => !player.isHost);
  const competitors: Competitor[] = isTeamMode
    ? teams.map(teamToCompetitor)
    : scorablePlayers.map(playerToCompetitor);
  const myCompetitorId = isTeamMode ? myTeamId : self.clientId;
  const unitLabel = isTeamMode ? "team" : "you";
  const hasTeam = !isTeamMode || myTeamId !== null;

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
            {styleChangeNotice && (
              <p className="player-room-status" role="status">
                {styleChangeNotice}
              </p>
            )}
            <GameSetupSummary deckSnapshot={room.deckSnapshot} />
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
            {styleChangeNotice && (
              <p className="player-room-status" role="status">
                {styleChangeNotice}
              </p>
            )}
            <GameSetupSummary deckSnapshot={room.deckSnapshot} />
            <div className="player-room-roster">
              <h2>Also here</h2>
              <PlayerList players={otherPlayers} emptyMessage="You're the first one here!" />
            </div>
          </>
        ))}

      {room.phase === "question" &&
        question &&
        (question.answerMethod === "multiple_choice" ? (
          <QuestionAnswering
            question={question}
            isTeamMode={isTeamMode}
            hasTeam={hasTeam}
            selectedOptionId={isTeamMode ? myTeamAnswerOptionId : myAnswerOptionId}
            onSelect={(optionId) => void (isTeamMode ? submitTeamAnswer(optionId) : submitAnswer(optionId))}
          />
        ) : (
          <TypedAnswerQuestionPhase
            question={question}
            isTeamMode={isTeamMode}
            hasTeam={hasTeam}
            submittedText={isTeamMode ? myTeamTypedAnswerText : myTypedAnswerText}
            onSubmit={(text) => (isTeamMode ? submitTeamTypedAnswer(text) : submitTypedAnswer(text))}
          />
        ))}

      {room.phase === "reveal" && question && (
        <RevealResult
          question={question}
          isTeamMode={isTeamMode}
          gradingStatus={isTeamMode ? myTeamGradingStatus : myGradingStatus}
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
  if (question.answerMethod !== "multiple_choice") return null;

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
              {isTeamMode
                ? "Team answer updated — anyone on your team can change this until the reveal."
                : "Recorded — you can change this until the reveal."}
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

function TypedAnswerQuestionPhase({
  question,
  isTeamMode,
  hasTeam,
  submittedText,
  onSubmit,
}: {
  question: TypedAnswerQuestion;
  isTeamMode: boolean;
  hasTeam: boolean;
  submittedText: string | null;
  onSubmit: (text: string) => Promise<void>;
}) {
  return (
    <div className="player-question">
      <h1>{question.prompt}</h1>
      {isTeamMode && !hasTeam ? (
        <p className="player-room-warning">You didn&rsquo;t join a team before the game started.</p>
      ) : (
        <TypedAnswerInput isTeamMode={isTeamMode} submittedText={submittedText} onSubmit={onSubmit} />
      )}
    </div>
  );
}

/**
 * The input box is deliberately never pre-filled or synced from
 * submittedText: it is the player's own private, unsent draft, and must
 * stay untouched if a teammate's Submit changes the shared answer out
 * from under them (the "Player A typing while Player B submits" edge
 * case). "Current answer"/"Team answer" is shown as a separate,
 * always-current readout above the form instead of being merged into
 * it. Typing never writes anywhere; only Submit does.
 *
 * A blank Submit is blocked with inline validation rather than treated
 * as silently clearing the answer - accidentally clearing a real
 * submitted answer with an empty tap would be a worse failure mode than
 * asking the player to type something first.
 */
function TypedAnswerInput({
  isTeamMode,
  submittedText,
  onSubmit,
}: {
  isTeamMode: boolean;
  submittedText: string | null;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setError("Type an answer before submitting.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="player-typed-answer">
      {submittedText !== null && (
        <p className="player-typed-current" role="status">
          {isTeamMode ? "Team answer: " : "Current answer: "}&ldquo;{submittedText}&rdquo;
        </p>
      )}
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="typed-answer-input">Your answer</label>
        <input
          id="typed-answer-input"
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={TYPED_ANSWER_MAX_LENGTH}
          autoComplete="off"
          disabled={busy}
        />
        {error && (
          <p className="player-room-warning" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Submit
        </button>
      </form>
      <p className="player-room-status">
        {submittedText !== null
          ? isTeamMode
            ? "Team answer updated — anyone on your team can change this until the reveal."
            : "You can still change this before the reveal."
          : isTeamMode
            ? "Type an answer and press Submit to set your team's answer."
            : "Type your answer and press Submit."}
      </p>
    </div>
  );
}

function RevealResult({
  question,
  isTeamMode,
  gradingStatus,
}: {
  question: Question;
  isTeamMode: boolean;
  gradingStatus: GradingStatus | null;
}) {
  const correctAnswerText =
    question.answerMethod === "multiple_choice"
      ? question.options.find((option) => option.id === question.correctOptionId)?.text
      : question.correctAnswer;

  const heading = (() => {
    if (gradingStatus === "correct") return isTeamMode ? "Your team got it! ✓" : "Correct! ✓";
    if (gradingStatus === "pending_review") return "Your answer is being checked.";
    if (gradingStatus === "incorrect") return "Not this time";
    return isTeamMode ? "Your team didn't answer" : "You didn't answer";
  })();

  return (
    <div className="player-reveal">
      <h1>{heading}</h1>
      <p>The answer was {correctAnswerText}.</p>
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
          {winners.length === 1
            ? `${winners[0].displayName} wins!`
            : `${winners.map((w) => w.displayName).join(", ")} tie for the win!`}
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
