import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useClientId } from "../hooks/useClientId";
import { useCreatorId } from "../hooks/useCreatorId";
import { useRoomChannel } from "../hooks/useRoomChannel";
import { useGameRoom } from "../hooks/useGameRoom";
import { useAutosaveController, type SaveStatus } from "../hooks/useAutosaveController";
import { getNextQuestionId, getQuestionById, type Question, type TypedAnswerQuestion } from "../data/questions";
import { computeAggregateReveal, computeWinners } from "../utils/scoring";
import { findSectionForQuestion, type RoomDeckSnapshot } from "../utils/gamePlan";
import { formatApproximateMinutes } from "../utils/formatDuration";
import { fetchDecksWithQuestions } from "../services/deckRepository";
import PlayerList from "../components/PlayerList";
import LoadingScreen from "../components/LoadingScreen";
import CompetitorLeaderboard from "../components/CompetitorLeaderboard";
import GameSetupPanel, { type DeckEntry } from "../components/GameSetupPanel";
import type { RoomPlayer } from "../types/room";
import type {
  AnswerRecord,
  CompetitionStyle,
  Competitor,
  PlayerRecord,
  TeamAnswerRecord,
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

interface PendingReviewItem {
  id: string;
  competitorName: string;
  submittedText: string;
}

function HostControlPanelPage() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const clientId = useClientId();
  const creatorId = useCreatorId();

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
    questionList,
    teamReadinessProblem,
    setCompetitionStyle,
    updateRoomSetup,
    startGame,
    revealAnswer,
    advanceQuestion,
    reviewAnswer,
    reviewTeamAnswer,
    showLeaderboard,
    showWinner,
    playAgain,
  } = useGameRoom({ roomCode, self });

  const [startError, setStartError] = useState<string | null>(null);

  // Every Deck the Host owns (in this browser), each with its full
  // Question list - the picker/readiness data GameSetupPanel needs.
  // Fetched once; My Decks/Deck Editor already refresh this list on
  // their own pages, and Deck content itself doesn't need to update
  // live inside this picker mid-Lobby (only the *selection* does).
  const [availableDecks, setAvailableDecks] = useState<DeckEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchDecksWithQuestions(creatorId)
      .then((decks) => {
        if (!cancelled) setAvailableDecks(decks);
      })
      .catch((error: unknown) => {
        console.error("Failed to load Decks for Game Setup:", error);
        if (!cancelled) setAvailableDecks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  // Mirrors room.deckSnapshot locally so the setup inputs stay
  // controlled and responsive while a write is debounced/in flight -
  // seeded once from the room's own planned_game the first time it's
  // seen, then treated as the source of truth for further local edits
  // (the same pattern DeckEditorPage uses for its title field).
  const [setupInitialized, setSetupInitialized] = useState(false);
  const [setupSelectedDeckIds, setSetupSelectedDeckIds] = useState<string[]>([]);
  const [setupTargetDurationSeconds, setSetupTargetDurationSeconds] = useState(30 * 60);
  const setupAutosave = useAutosaveController();

  useEffect(() => {
    if (setupInitialized || !room) return;
    if (room.deckSnapshot?.kind === "planned_game") {
      setSetupSelectedDeckIds(room.deckSnapshot.selectedDeckIds);
      setSetupTargetDurationSeconds(room.deckSnapshot.targetDurationSeconds);
    }
    setSetupInitialized(true);
  }, [room, setupInitialized]);

  function handleChangeSelection(nextIds: string[]) {
    setSetupSelectedDeckIds(nextIds);
    void setupAutosave
      .saveNow("room-setup", () => updateRoomSetup(nextIds, setupTargetDurationSeconds))
      .catch(() => {
        // Status badge already reflects the failure; Retry re-attempts this same write.
      });
  }

  function handleChangeDuration(nextSeconds: number) {
    setSetupTargetDurationSeconds(nextSeconds);
    setupAutosave.scheduleSave("room-setup", () => updateRoomSetup(setupSelectedDeckIds, nextSeconds));
  }

  const [styleError, setStyleError] = useState<string | null>(null);

  async function handleChangeStyle(style: CompetitionStyle) {
    if (!room || style === room.competitionStyle) return;
    setStyleError(null);
    const hasJoinedCompetitors =
      room.competitionStyle === "team" ? teams.length > 0 : players.filter((player) => !player.isHost).length > 0;
    if (hasJoinedCompetitors) {
      const message =
        style === "team"
          ? "Switching to Team Play means every joined Player will need to choose a Team before you can start. Continue?"
          : "Switching to Solo Play will disband all current Teams. Continue?";
      if (!window.confirm(message)) return;
    }
    const result = await setCompetitionStyle(style);
    if (!result.ok) {
      setStyleError("Couldn't change competition style right now. Try again.");
    }
  }

  async function handleStart() {
    setStartError(null);
    const result = await startGame();
    if (!result.ok) {
      setStartError(result.error ?? "Couldn't start the game. Try again.");
    }
  }

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

  const question = getQuestionById(questionList, room.currentQuestionId);
  const sectionInfo =
    room.deckSnapshot?.kind === "game_plan" ? findSectionForQuestion(room.deckSnapshot, room.currentQuestionId) : null;
  const isTeamMode = room.competitionStyle === "team";
  const competitors: Competitor[] = isTeamMode
    ? teams.map(teamToCompetitor)
    : scorablePlayers.map(playerToCompetitor);
  const unitLabel = isTeamMode ? "team" : "player";
  const totalCompetitors = isTeamMode ? teams.length : scorablePlayers.length;

  const gradedAnswers = isTeamMode ? teamAnswers : answers;
  const pendingItems: PendingReviewItem[] = gradedAnswers
    .filter((answer) => answer.gradingStatus === "pending_review")
    .map((answer) => {
      if (isTeamMode) {
        const teamAnswer = answer as TeamAnswerRecord;
        const team = teams.find((t) => t.id === teamAnswer.teamId);
        return {
          id: teamAnswer.teamId,
          competitorName: team?.name ?? "A team",
          submittedText: teamAnswer.textAnswer ?? "",
        };
      }
      const playerAnswer = answer as AnswerRecord;
      const player = scorablePlayers.find((p) => p.clientId === playerAnswer.clientId);
      return {
        id: playerAnswer.clientId,
        competitorName: player?.displayName ?? "A player",
        submittedText: playerAnswer.textAnswer ?? "",
      };
    });

  const nextQuestionId = getNextQuestionId(questionList, room.currentQuestionId);

  function handleReview(id: string, decision: "correct" | "incorrect") {
    if (isTeamMode) {
      void reviewTeamAnswer(id, decision);
    } else {
      void reviewAnswer(id, decision);
    }
  }

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
          onChangeStyle={(style) => void handleChangeStyle(style)}
          styleError={styleError}
          joinedPlayers={joinedPlayers}
          teams={teams}
          teamPlayers={scorablePlayers}
          onStart={() => void handleStart()}
          startError={startError}
          teamReadinessProblem={teamReadinessProblem}
          deckSnapshot={room.deckSnapshot}
          availableDecks={availableDecks}
          setupSelectedDeckIds={setupSelectedDeckIds}
          setupTargetDurationSeconds={setupTargetDurationSeconds}
          onChangeSelection={handleChangeSelection}
          onChangeDuration={handleChangeDuration}
          setupStatus={setupAutosave.status}
          onRetrySetup={setupAutosave.retry}
        />
      )}

      {room.phase === "question" && question && (
        <QuestionPhase
          question={question}
          sectionInfo={sectionInfo}
          answeredCount={gradedAnswers.length}
          totalCompetitors={totalCompetitors}
          unitLabel={unitLabel}
          onReveal={() => void revealAnswer()}
        />
      )}

      {room.phase === "reveal" && question && (
        <RevealPhase
          question={question}
          answers={gradedAnswers}
          pendingItems={pendingItems}
          onReview={handleReview}
          onContinue={() => void (nextQuestionId ? advanceQuestion() : showLeaderboard())}
          continueLabel={nextQuestionId ? "Continue to Next Question" : "Show Leaderboard"}
        />
      )}

      {room.phase === "leaderboard" && (
        <LeaderboardPhase
          competitors={competitors}
          unitLabel={unitLabel}
          pendingItems={pendingItems}
          question={question}
          onReview={handleReview}
          onShowWinner={() => void showWinner()}
        />
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
  onChange,
}: {
  value: CompetitionStyle;
  onChange: (style: CompetitionStyle) => void;
}) {
  return (
    <fieldset className="host-style-picker">
      <legend>Competition Style</legend>
      <label>
        <input
          type="radio"
          name="competition-style"
          value="team"
          checked={value === "team"}
          onChange={() => onChange("team")}
        />
        Team Play
      </label>
      <label>
        <input
          type="radio"
          name="competition-style"
          value="solo"
          checked={value === "solo"}
          onChange={() => onChange("solo")}
        />
        Solo Play
      </label>
    </fieldset>
  );
}

function SetupSaveStatusBadge({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle") return null;
  return (
    <p className="host-setup-save-status" role="status">
      {status === "saving" && "Saving setup…"}
      {status === "saved" && "Setup saved"}
      {status === "error" && (
        <>
          Couldn&rsquo;t save setup.{" "}
          <button type="button" className="host-setup-retry" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
    </p>
  );
}

function RematchSummary({ plan }: { plan: Extract<RoomDeckSnapshot, { kind: "game_plan" }> }) {
  return (
    <div className="host-lobby-setup card">
      <h3>Game Plan (locked)</h3>
      <p className="host-lobby-status">
        This rematch reuses the same Game Plan as before. To change Decks or duration, create a new room.
      </p>
      <ul className="game-setup-panel-list">
        {plan.sections.map((section, index) => (
          <li key={section.deckId} className="game-setup-panel-item">
            <span>
              {index + 1}. {section.deckTitle}
            </span>
            <span className="game-setup-panel-hint">
              {section.questionIds.length} Question{section.questionIds.length === 1 ? "" : "s"} ·{" "}
              {formatApproximateMinutes(section.estimatedSeconds)}
            </span>
          </li>
        ))}
      </ul>
      <p className="host-lobby-status">
        {plan.questions.length} Question{plan.questions.length === 1 ? "" : "s"} ·{" "}
        {formatApproximateMinutes(plan.estimatedDurationSeconds)}
      </p>
    </div>
  );
}

function LobbyPhase({
  competitionStyle,
  onChangeStyle,
  styleError,
  joinedPlayers,
  teams,
  teamPlayers,
  onStart,
  startError,
  teamReadinessProblem,
  deckSnapshot,
  availableDecks,
  setupSelectedDeckIds,
  setupTargetDurationSeconds,
  onChangeSelection,
  onChangeDuration,
  setupStatus,
  onRetrySetup,
}: {
  competitionStyle: CompetitionStyle;
  onChangeStyle: (style: CompetitionStyle) => void;
  styleError: string | null;
  joinedPlayers: RoomPlayer[];
  teams: TeamRecord[];
  teamPlayers: PlayerRecord[];
  onStart: () => void;
  startError: string | null;
  teamReadinessProblem: string | null;
  deckSnapshot: RoomDeckSnapshot | null;
  availableDecks: DeckEntry[] | null;
  setupSelectedDeckIds: string[];
  setupTargetDurationSeconds: number;
  onChangeSelection: (selectedDeckIds: string[]) => void;
  onChangeDuration: (targetDurationSeconds: number) => void;
  setupStatus: SaveStatus;
  onRetrySetup: () => void;
}) {
  const isRematch = deckSnapshot?.kind === "game_plan";
  const isQuickPlay = deckSnapshot === null;
  const isLiveSetup = deckSnapshot?.kind === "planned_game";

  const deckSelectionBlocked = isLiveSetup && deckSnapshot.selectedDeckIds.length === 0;
  const startBlockedReason =
    teamReadinessProblem ?? (deckSelectionBlocked ? "Choose at least one Deck before starting." : null);

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
      <CompetitionStylePicker value={competitionStyle} onChange={onChangeStyle} />
      {styleError && (
        <p className="host-style-note" role="alert">
          {styleError}
        </p>
      )}

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

      {isQuickPlay && (
        <div className="host-lobby-setup card">
          <h3>Quick Play</h3>
          <p className="host-lobby-status">Playing the built-in sample Questions.</p>
        </div>
      )}

      {isRematch && <RematchSummary plan={deckSnapshot} />}

      {isLiveSetup && (
        <div className="host-lobby-setup">
          <div className="host-lobby-setup-header">
            <h3>Game Setup</h3>
            <SetupSaveStatusBadge status={setupStatus} onRetry={onRetrySetup} />
          </div>
          {availableDecks === null ? (
            <p className="host-lobby-status">Loading your Decks...</p>
          ) : availableDecks.length === 0 ? (
            <p className="host-lobby-status">You haven&rsquo;t created any Decks yet. Manage Decks from My Decks.</p>
          ) : (
            <GameSetupPanel
              availableDecks={availableDecks}
              selectedDeckIds={setupSelectedDeckIds}
              targetDurationSeconds={setupTargetDurationSeconds}
              onChangeSelection={onChangeSelection}
              onChangeDuration={onChangeDuration}
            />
          )}
        </div>
      )}

      {startHint && <p className="host-answered-count">{startHint}</p>}
      {startBlockedReason && (
        <p className="host-style-note" role="alert">
          {startBlockedReason}
        </p>
      )}
      {startError && (
        <p className="host-style-note" role="alert">
          {startError}
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={onStart} disabled={startBlockedReason !== null}>
        {isRematch ? "Start Rematch" : "Start Game"}
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
  sectionInfo,
  answeredCount,
  totalCompetitors,
  unitLabel,
  onReveal,
}: {
  question: Question;
  sectionInfo: { section: { deckTitle: string }; sectionNumber: number; totalSections: number } | null;
  answeredCount: number;
  totalCompetitors: number;
  unitLabel: string;
  onReveal: () => void;
}) {
  const verb = question.answerMethod === "typed_answer" ? "submitted" : "answered";

  return (
    <div className="host-phase card">
      <p className="host-phase-label">
        Question
        {sectionInfo &&
          ` — ${sectionInfo.section.deckTitle} — Deck ${sectionInfo.sectionNumber} of ${sectionInfo.totalSections}`}
      </p>
      <h2>{question.prompt}</h2>

      {question.answerMethod === "multiple_choice" ? (
        <ul className="host-options">
          {question.options.map((option) => (
            <li key={option.id} className={option.id === question.correctOptionId ? "host-options-correct" : ""}>
              {option.id}. {option.text}
              {option.id === question.correctOptionId && " (correct)"}
            </li>
          ))}
        </ul>
      ) : (
        <div className="host-typed-answer-key">
          <p>
            Correct answer (Host only): <strong>{question.correctAnswer}</strong>
          </p>
          {question.acceptedAnswers.length > 0 && (
            <p className="host-lobby-status">Also accepted: {question.acceptedAnswers.join(", ")}</p>
          )}
        </div>
      )}

      <p className="host-answered-count">
        {answeredCount} of {totalCompetitors} {unitLabel}
        {totalCompetitors === 1 ? "" : "s"} {verb}
      </p>
      <button type="button" className="btn btn-primary" onClick={onReveal}>
        Reveal Answer
      </button>
    </div>
  );
}

function TypedAnswerReviewQueue({
  items,
  question,
  onReview,
}: {
  items: PendingReviewItem[];
  question: TypedAnswerQuestion;
  onReview: (id: string, decision: "correct" | "incorrect") => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="host-review-queue">
      <h3>
        Possible typo{items.length === 1 ? "" : "s"} - {items.length} to review
      </h3>
      <ul>
        {items.map((item) => (
          <li key={item.id} className="host-review-item">
            <p>
              <strong>{item.competitorName}</strong> answered:
            </p>
            <p className="host-review-submitted">&ldquo;{item.submittedText}&rdquo;</p>
            <p className="host-lobby-status">Correct answer: &ldquo;{question.correctAnswer}&rdquo;</p>
            <div className="host-review-actions">
              <button type="button" className="btn btn-primary" onClick={() => onReview(item.id, "correct")}>
                Accept
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onReview(item.id, "incorrect")}>
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RevealPhase({
  question,
  answers,
  pendingItems,
  onReview,
  onContinue,
  continueLabel,
}: {
  question: Question;
  answers: AnswerRecord[] | TeamAnswerRecord[];
  pendingItems: PendingReviewItem[];
  onReview: (id: string, decision: "correct" | "incorrect") => void;
  onContinue: () => void;
  continueLabel: string;
}) {
  const aggregate = computeAggregateReveal(answers);
  const correctAnswerText =
    question.answerMethod === "multiple_choice"
      ? question.options.find((option) => option.id === question.correctOptionId)?.text
      : question.correctAnswer;

  return (
    <div className="host-phase card">
      <p className="host-phase-label">Reveal</p>
      <h2>The answer was {correctAnswerText}</h2>
      <p className="host-aggregate">
        {aggregate.correctCount} of {aggregate.correctCount + aggregate.incorrectCount} correct (
        {aggregate.percentageCorrect}%)
        {aggregate.pendingCount > 0 &&
          ` — ${aggregate.pendingCount} still being checked`}
      </p>

      {question.answerMethod === "typed_answer" && pendingItems.length > 0 && (
        <TypedAnswerReviewQueue items={pendingItems} question={question} onReview={onReview} />
      )}

      {pendingItems.length > 0 ? (
        <button type="button" className="btn btn-ghost" onClick={onContinue}>
          Continue With Provisional Scores
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={onContinue}>
          {continueLabel}
        </button>
      )}
    </div>
  );
}

function LeaderboardPhase({
  competitors,
  unitLabel,
  pendingItems,
  question,
  onReview,
  onShowWinner,
}: {
  competitors: Competitor[];
  unitLabel: string;
  pendingItems: PendingReviewItem[];
  question: Question | null;
  onReview: (id: string, decision: "correct" | "incorrect") => void;
  onShowWinner: () => void;
}) {
  return (
    <div className="host-phase card">
      <p className="host-phase-label">Leaderboard</p>
      <CompetitorLeaderboard competitors={competitors} emptyMessage={`No ${unitLabel}s to show yet.`} />

      {pendingItems.length > 0 && question?.answerMethod === "typed_answer" ? (
        <>
          <p className="host-lobby-status" role="status">
            {pendingItems.length} answer{pendingItems.length === 1 ? "" : "s"} still need review before the winner
            can be shown.
          </p>
          <TypedAnswerReviewQueue items={pendingItems} question={question} onReview={onReview} />
        </>
      ) : (
        <button type="button" className="btn btn-primary" onClick={onShowWinner}>
          Show Winner
        </button>
      )}
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
