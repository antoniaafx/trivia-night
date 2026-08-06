import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useClientId } from "../hooks/useClientId";
import { useCreatorId } from "../hooks/useCreatorId";
import { useRoomChannel } from "../hooks/useRoomChannel";
import { useGameRoom } from "../hooks/useGameRoom";
import { useAutosaveController, type SaveStatus } from "../hooks/useAutosaveController";
import { useCountdown } from "../hooks/useCountdown";
import { useRosterLimit } from "../hooks/useRosterLimit";
import { formatCountdown } from "../utils/timer";
import { getNextQuestionId, getQuestionById, type Question, type TypedAnswerQuestion } from "../data/questions";
import {
  computePlanSummary,
  findSectionForQuestion,
  QUESTION_FLOW_DEFAULT,
  type HostParticipation,
  type QuestionFlow,
  type RoomDeckSnapshot,
} from "../utils/gamePlan";
import { QUESTION_TIMER_OPTIONS_SECONDS, QUESTION_TIMER_SECONDS_DEFAULT } from "../config/timingEstimates";
import { buildJoinUrl, buildStageUrl } from "../utils/roomLinks";
import { avatarForClientId } from "../utils/avatars";
import { fetchDecksWithQuestions } from "../services/deckRepository";
import RoomQrCode from "../components/RoomQrCode";
import LoadingScreen from "../components/LoadingScreen";
import SelectedDecksPanel from "../components/SelectedDecksPanel";
import DeckPicker from "../components/DeckPicker";
import GameSummaryCard from "../components/GameSummaryCard";
import LeaderboardScreen from "../components/LeaderboardScreen";
import type { RoomPlayer } from "../types/room";
import type { DeckEntry } from "../types/deck";
import type {
  AnswerRecord,
  CompetitionStyle,
  Competitor,
  PlayerRecord,
  TeamAnswerRecord,
  TeamRecord,
  TimerStatus,
} from "../types/game";
import { playerToCompetitor, teamToCompetitor } from "../types/game";
import "../styles/hostDashboardShell.css";
import "../styles/liveGameShell.css";
import "../styles/leaderboardShell.css";
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
    lobbyStage,
    setCompetitionStyle,
    updateRoomSetup,
    setHostParticipation,
    setQuestionTimer,
    setQuestionFlow,
    advanceToSetup,
    returnToInvite,
    startGame,
    revealAnswer,
    startTimer,
    pauseTimer,
    resumeTimer,
    expireTimer,
    advanceQuestion,
    reviewAnswer,
    reviewTeamAnswer,
    showLeaderboard,
    showWinner,
    playAgain,
  } = useGameRoom({ roomCode, self });

  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  // Shared by Continue / Back to Invite: the Host only ever sees one of
  // these two buttons at a time, so one busy/error pair is enough.
  const [stageBusy, setStageBusy] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);

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
  const [setupQuestionTimerSeconds, setSetupQuestionTimerSeconds] = useState<number | null>(
    QUESTION_TIMER_SECONDS_DEFAULT,
  );
  const [setupQuestionFlow, setSetupQuestionFlow] = useState<QuestionFlow>(QUESTION_FLOW_DEFAULT);
  const setupAutosave = useAutosaveController();

  useEffect(() => {
    if (setupInitialized || !room) return;
    if (room.deckSnapshot?.kind === "planned_game") {
      setSetupSelectedDeckIds(room.deckSnapshot.selectedDeckIds);
      setSetupQuestionTimerSeconds(room.deckSnapshot.questionTimerSeconds);
      setSetupQuestionFlow(room.deckSnapshot.questionFlow);
    }
    setSetupInitialized(true);
  }, [room, setupInitialized]);

  function handleChangeSelection(nextIds: string[]) {
    setSetupSelectedDeckIds(nextIds);
    void setupAutosave.saveNow("room-setup", () => updateRoomSetup(nextIds)).catch(() => {
      // Status badge already reflects the failure; Retry re-attempts this same write.
    });
  }

  function handleChangeQuestionTimer(value: number | null) {
    setSetupQuestionTimerSeconds(value);
    void setupAutosave.saveNow("room-setup", () => setQuestionTimer(value)).catch(() => {
      // Status badge already reflects the failure; Retry re-attempts this same write.
    });
  }

  function handleChangeQuestionFlow(value: QuestionFlow) {
    setSetupQuestionFlow(value);
    void setupAutosave.saveNow("room-setup", () => setQuestionFlow(value)).catch(() => {
      // Status badge already reflects the failure; Retry re-attempts this same write.
    });
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
    if (starting) return;
    setStartError(null);
    setStarting(true);
    try {
      const result = await startGame();
      if (!result.ok) {
        setStartError(result.error ?? "Couldn't start the game. Try again.");
      }
    } finally {
      setStarting(false);
    }
  }

  /**
   * revealAnswer grades every submission and writes scores before it
   * ever flips `phase` to "reveal" (see revealAndScore's doc comment) -
   * if grading fails partway, the write to `phase` never happens and
   * the room stays validly in "question", so a failure here can never
   * leave a half-updated reveal. What it previously couldn't do was
   * tell the Host that happened: the button just silently did nothing.
   */
  async function handleReveal() {
    if (revealing) return;
    setRevealError(null);
    setRevealing(true);
    try {
      await revealAnswer();
    } catch (error) {
      setRevealError(error instanceof Error ? error.message : "Couldn't reveal the answer. Try again.");
    } finally {
      setRevealing(false);
    }
  }

  const [timerActionBusy, setTimerActionBusy] = useState(false);
  const [timerActionError, setTimerActionError] = useState<string | null>(null);

  async function handleStartTimer() {
    if (timerActionBusy) return;
    setTimerActionError(null);
    setTimerActionBusy(true);
    try {
      await startTimer();
    } catch (error) {
      setTimerActionError(error instanceof Error ? error.message : "Couldn't start the timer. Try again.");
    } finally {
      setTimerActionBusy(false);
    }
  }

  async function handlePauseTimer() {
    if (timerActionBusy) return;
    setTimerActionError(null);
    setTimerActionBusy(true);
    try {
      await pauseTimer();
    } catch (error) {
      setTimerActionError(error instanceof Error ? error.message : "Couldn't pause the timer. Try again.");
    } finally {
      setTimerActionBusy(false);
    }
  }

  async function handleResumeTimer() {
    if (timerActionBusy) return;
    setTimerActionError(null);
    setTimerActionBusy(true);
    try {
      await resumeTimer();
    } catch (error) {
      setTimerActionError(error instanceof Error ? error.message : "Couldn't resume the timer. Try again.");
    } finally {
      setTimerActionBusy(false);
    }
  }

  // The Host's own client is the sole driver of timer expiry - every
  // other phase-affecting write in this app (Reveal, advanceQuestion,
  // transitionPhase) is already Host-only, and Players/Stage are pure
  // observers of room state. useCountdown ticks this component every
  // second while the timer is running, anchored to the same server
  // timestamp every client uses (see utils/timer.ts); once the locally
  // computed remaining time reaches zero, this fires exactly one write
  // (guarded server-side by expireTimer's own optimistic-concurrency
  // check, so a race with a manual Reveal is harmless).
  const liveRemainingSeconds = useCountdown(
    room?.timerStatus ?? "not_started",
    room?.timerStartedAt ?? null,
    room?.timerRemainingSeconds ?? null,
  );

  useEffect(() => {
    if (room?.phase !== "question" || room.timerStatus !== "running") return;
    if (liveRemainingSeconds === null || liveRemainingSeconds > 0) return;
    void expireTimer();
  }, [room?.phase, room?.timerStatus, liveRemainingSeconds, expireTimer]);

  async function handleContinueToSetup() {
    if (stageBusy) return;
    setStageError(null);
    setStageBusy(true);
    try {
      await advanceToSetup();
    } catch (error) {
      setStageError(error instanceof Error ? error.message : "Couldn't continue. Try again.");
    } finally {
      setStageBusy(false);
    }
  }

  async function handleReturnToInvite() {
    if (stageBusy) return;
    setStageError(null);
    setStageBusy(true);
    try {
      await returnToInvite();
    } catch (error) {
      setStageError(error instanceof Error ? error.message : "Couldn't return to Invite. Try again.");
    } finally {
      setStageBusy(false);
    }
  }

  async function handleSetHostParticipation(value: HostParticipation) {
    try {
      await setHostParticipation(value);
    } catch (error) {
      setStageError(error instanceof Error ? error.message : "Couldn't update Host Participation. Try again.");
    }
  }

  const joinUrl = buildJoinUrl(window.location.origin, roomCode);
  const stageUrl = buildStageUrl(window.location.origin, roomCode);
  const joinedPlayers = presencePlayers.filter((player) => !player.isHost);
  const scorablePlayers = players.filter((player) => !player.isHost);

  if (connectionStatus === "unconfigured" || presenceStatus === "unconfigured") {
    return (
      <div className="host-lobby">
        <p className="host-lobby-status" role="status">
          {describeStatus("unconfigured")}
        </p>
      </div>
    );
  }

  if (loading) {
    return <LoadingScreen message="Loading room..." />;
  }

  if (roomNotFound || !room) {
    return (
      <div className="host-lobby">
        <h1>We couldn&rsquo;t create this room</h1>
        <p className="host-lobby-status">Refresh the page to try again.</p>
      </div>
    );
  }

  const question = getQuestionById(questionList, room.currentQuestionId);
  const sectionInfo =
    room.deckSnapshot?.kind === "game_plan" ? findSectionForQuestion(room.deckSnapshot, room.currentQuestionId) : null;
  const questionNumber = questionList.findIndex((q) => q.id === room.currentQuestionId) + 1;
  const questionTimerSeconds = room.deckSnapshot?.questionTimerSeconds ?? null;
  const questionFlow = room.deckSnapshot?.questionFlow ?? QUESTION_FLOW_DEFAULT;
  const isTeamMode = room.competitionStyle === "team";
  const competitors: Competitor[] = isTeamMode
    ? teams.map(teamToCompetitor)
    : scorablePlayers.map(playerToCompetitor);
  const unitLabel = isTeamMode ? "team" : "player";

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

  // Who has/hasn't answered the current Question yet, by name - not just
  // an aggregate count. Derived the same way pendingItems already is
  // (matching gradedAnswers' clientId/teamId against competitors), no
  // new backend read: this is the same data QuestionPhase's old "4 / 5
  // answered" counter was already built from, just kept per-competitor
  // instead of collapsed into a number.
  const answeredCompetitorIds = new Set(
    gradedAnswers.map((answer) => (isTeamMode ? (answer as TeamAnswerRecord).teamId : (answer as AnswerRecord).clientId)),
  );
  const answeredCompetitors = competitors.filter((competitor) => answeredCompetitorIds.has(competitor.id));
  const waitingCompetitors = competitors.filter((competitor) => !answeredCompetitorIds.has(competitor.id));

  // Reveal's per-competitor result grouping - the exact same authoritative
  // gradingStatus revealAndScore already wrote per answer row (see its own
  // doc comment: grading + scores are written atomically before `phase`
  // ever flips to "reveal"), just grouped by outcome instead of collapsed
  // into computeAggregateReveal's totals. No new grading logic: a
  // competitor who never submitted has no entry in gradedAnswers at all
  // (No Answer); "pending_review" is Typed Answer's existing fuzzy-match
  // queue, unresolved.
  const resultStatusByCompetitorId = new Map(
    gradedAnswers.map(
      (answer) =>
        [
          isTeamMode ? (answer as TeamAnswerRecord).teamId : (answer as AnswerRecord).clientId,
          answer.gradingStatus,
        ] as const,
    ),
  );
  const correctCompetitors = competitors.filter((competitor) => resultStatusByCompetitorId.get(competitor.id) === "correct");
  const incorrectCompetitors = competitors.filter(
    (competitor) => resultStatusByCompetitorId.get(competitor.id) === "incorrect",
  );
  const pendingReviewCompetitors = competitors.filter((competitor) => {
    const status = resultStatusByCompetitorId.get(competitor.id);
    return status === "pending_review" || status === "ungraded";
  });
  const noAnswerCompetitors = competitors.filter((competitor) => !resultStatusByCompetitorId.has(competitor.id));

  const nextQuestionId = getNextQuestionId(questionList, room.currentQuestionId);

  async function handleReview(id: string, decision: "correct" | "incorrect") {
    setBusyReviewId(id);
    try {
      if (isTeamMode) {
        await reviewTeamAnswer(id, decision);
      } else {
        await reviewAnswer(id, decision);
      }
    } finally {
      setBusyReviewId(null);
    }
  }

  return (
    <div className="host-lobby">
      {room.phase === "lobby" && lobbyStage === "invite" && (
        <InviteLobbyPhase
          roomCode={roomCode}
          joinUrl={joinUrl}
          stageUrl={stageUrl}
          connectionStatus={connectionStatus}
          joinedPlayers={joinedPlayers}
          onContinue={() => void handleContinueToSetup()}
          continuing={stageBusy}
          continueError={stageError}
        />
      )}

      {room.phase === "lobby" && lobbyStage === "setup" && room.deckSnapshot && (
        <GameSetupPhase
          roomCode={roomCode}
          joinUrl={joinUrl}
          stageUrl={stageUrl}
          connectionStatus={connectionStatus}
          competitionStyle={room.competitionStyle}
          onChangeStyle={(style) => void handleChangeStyle(style)}
          styleError={styleError}
          joinedPlayers={joinedPlayers}
          teams={teams}
          teamPlayers={scorablePlayers}
          deckSnapshot={room.deckSnapshot}
          teamReadinessProblem={teamReadinessProblem}
          onSetHostParticipation={(value) => void handleSetHostParticipation(value)}
          availableDecks={availableDecks}
          setupSelectedDeckIds={setupSelectedDeckIds}
          onChangeSelection={handleChangeSelection}
          setupQuestionTimerSeconds={setupQuestionTimerSeconds}
          onChangeQuestionTimer={handleChangeQuestionTimer}
          setupQuestionFlow={setupQuestionFlow}
          onChangeQuestionFlow={handleChangeQuestionFlow}
          setupStatus={setupAutosave.status}
          onRetrySetup={setupAutosave.retry}
          onReturnToInvite={() => void handleReturnToInvite()}
          returningToInvite={stageBusy}
          returnError={stageError}
          onStart={() => void handleStart()}
          starting={starting}
          startError={startError}
        />
      )}

      {/* The live Question/Reveal screen (see LiveGamePhase's own doc
          comment) is a full control centre in its own right, with no
          spare room or need for a second, redundant QR/room-code
          reminder card above it - Open Stage stayed reachable from the
          Dashboard's fixed panel every phase before this one. Every
          other phase this app doesn't yet have a dedicated screen for
          still gets this simple fallback, unchanged. */}
      {!(
        (room.phase === "lobby" && (lobbyStage === "invite" || lobbyStage === "setup")) ||
        room.phase === "question" ||
        room.phase === "reveal" ||
        room.phase === "leaderboard" ||
        room.phase === "ended"
      ) && (
        <div className="host-lobby-invite card">
          <RoomQrCode joinUrl={joinUrl} size={180} />
          <p className="host-lobby-code">
            Room code: <strong>{roomCode}</strong>
          </p>
          <p className="host-lobby-status" role="status">
            {describeStatus(connectionStatus)}
          </p>
          <a href={stageUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
            Open Stage
          </a>
        </div>
      )}

      {/* Question and Reveal are two states of the exact same control
          centre, rendered by the same component at the same DOM
          position - see LiveGamePhase's own doc comment for why that's
          what keeps the header/two-column layout from jumping or
          remounting the moment Reveal Answer is pressed. */}
      {(room.phase === "question" || room.phase === "reveal") && question && (
        <LiveGamePhase
          question={question}
          sectionInfo={sectionInfo}
          questionNumber={questionNumber}
          totalQuestions={questionList.length}
          revealed={room.phase === "reveal"}
          isTeamMode={isTeamMode}
          answeredCompetitors={answeredCompetitors}
          waitingCompetitors={waitingCompetitors}
          correctCompetitors={correctCompetitors}
          incorrectCompetitors={incorrectCompetitors}
          pendingReviewCompetitors={pendingReviewCompetitors}
          noAnswerCompetitors={noAnswerCompetitors}
          unitLabel={unitLabel}
          questionTimerSeconds={questionTimerSeconds}
          questionFlow={questionFlow}
          timerStatus={room.timerStatus}
          remainingSeconds={liveRemainingSeconds}
          onStartTimer={() => void handleStartTimer()}
          onPauseTimer={() => void handlePauseTimer()}
          onResumeTimer={() => void handleResumeTimer()}
          timerActionBusy={timerActionBusy}
          timerActionError={timerActionError}
          onReveal={() => void handleReveal()}
          revealing={revealing}
          revealError={revealError}
          pendingItems={pendingItems}
          busyReviewId={busyReviewId}
          onReview={(id, decision) => void handleReview(id, decision)}
          onContinue={() => void (nextQuestionId ? advanceQuestion() : showLeaderboard())}
          continueLabel={nextQuestionId ? "Next Question" : "Finish Game"}
        />
      )}

      {(room.phase === "question" || room.phase === "reveal") && !question && (
        <div className="host-phase card">
          <p className="host-phase-label">{room.phase === "question" ? "Question" : "Reveal"}</p>
          <p className="host-lobby-status" role="status">
            Catching up with the {room.phase === "question" ? "current Question" : "reveal"}…
          </p>
        </div>
      )}

      {/* Leaderboard and Ended are two states of the same screen, not a
          standings page followed by a separate winner page - see
          HostLeaderboardPhase's own doc comment. */}
      {(room.phase === "leaderboard" || room.phase === "ended") && (
        <HostLeaderboardPhase
          ended={room.phase === "ended"}
          competitors={competitors}
          unitLabel={unitLabel}
          totalQuestions={questionList.length}
          winnerIds={room.winnerIds}
          pendingItems={pendingItems}
          busyReviewId={busyReviewId}
          question={question}
          onReview={(id, decision) => void handleReview(id, decision)}
          onShowWinner={() => void showWinner()}
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
      <legend className="sr-only-label">Competition Style</legend>
      <label>
        <input
          type="radio"
          name="competition-style"
          value="team"
          checked={value === "team"}
          onChange={() => onChange("team")}
        />
        Teams
      </label>
      <label>
        <input
          type="radio"
          name="competition-style"
          value="solo"
          checked={value === "solo"}
          onChange={() => onChange("solo")}
        />
        Solo
      </label>
    </fieldset>
  );
}

function SetupSaveStatusBadge({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle") return null;
  return (
    <p className="host-setup-save-status" role="status">
      {status === "saving" && "Saving..."}
      {status === "saved" && "✓ Saved"}
      {status === "error" && (
        <>
          Couldn&rsquo;t save.{" "}
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
        This rematch reuses the same Game Plan as before. To change Decks, create a new room.
      </p>
      <ul className="game-setup-panel-list">
        {plan.sections.map((section, index) => (
          <li key={section.deckId} className="game-setup-panel-item">
            <span>
              {index + 1}. {section.deckTitle}
            </span>
            <span className="game-setup-panel-hint">
              {section.questionIds.length} Question{section.questionIds.length === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
      <p className="host-lobby-status">
        {plan.questions.length} Question{plan.questions.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/**
 * Stage 1 - just getting people connected. Deliberately shows no game
 * settings at all (not even the Competition Style picker) - that's
 * Game Setup's job. Continue is always available, even with zero
 * Players, so the Host can test alone; its label makes that explicit
 * ("Continue without players") rather than implying something is
 * missing, as "Continue Anyway" used to.
 *
 * The exact same fixed room panel + right-panel dashboard system as
 * GameSetupPhase (see HostRoomPanel and .host-dashboard-panel's own
 * doc comments) - not a visually-similar rebuild, the same shared
 * components and CSS classes, so the frame around the content is
 * pixel-identical and pressing Continue only ever swaps what's inside
 * .host-dashboard-content and the footer, never the frame itself.
 */
function InviteLobbyPhase({
  roomCode,
  joinUrl,
  stageUrl,
  connectionStatus,
  joinedPlayers,
  onContinue,
  continuing,
  continueError,
}: {
  roomCode: string;
  joinUrl: string;
  stageUrl: string;
  connectionStatus: string;
  joinedPlayers: RoomPlayer[];
  onContinue: () => void;
  continuing: boolean;
  continueError: string | null;
}) {
  const rosterLimit = useRosterLimit();
  const count = joinedPlayers.length;
  const visiblePlayers = joinedPlayers.slice(0, rosterLimit);
  const remaining = count - visiblePlayers.length;
  const continueLabel = count === 0 ? "Continue without players" : "Continue";

  return (
    <div className="host-dashboard">
      <HostRoomPanel
        roomCode={roomCode}
        joinUrl={joinUrl}
        stageUrl={stageUrl}
        connectionStatus={connectionStatus}
        showBackToInvite={false}
      />

      <div className="host-dashboard-main">
        <div className="host-dashboard-panel card">
          <div className="host-dashboard-content">
            <div className="host-dashboard-header">
              <div>
                <p className="host-dashboard-eyebrow">Host Lobby</p>
                <h2>Waiting for Players</h2>
              </div>
            </div>

            <section className="host-dashboard-section">
              <h3>Players Joining</h3>
              <p className="host-room-status-count" role="status">
                {count} Player{count === 1 ? "" : "s"} Joined
              </p>
              {count === 0 ? (
                <p className="host-dashboard-section-helper">Share the QR code or room code to invite Players.</p>
              ) : (
                <ul className="host-room-status-roster">
                  {visiblePlayers.map((player) => (
                    <li key={player.clientId}>
                      <span aria-hidden="true">{avatarForClientId(player.clientId)}</span> {player.displayName}
                    </li>
                  ))}
                  {remaining > 0 && <li className="host-roster-more">+{remaining} more</li>}
                </ul>
              )}
            </section>

            {continueError && (
              <p className="host-style-note" role="alert">
                {continueError}
              </p>
            )}

            <button
              type="button"
              className="btn btn-primary host-floating-action"
              onClick={onContinue}
              disabled={continuing}
            >
              {continuing ? "Continuing…" : continueLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One row of the settings dashboard, not an independent floating card -
 * see .host-dashboard-panel's doc comment in the CSS for why these are
 * deliberately rows within one shared surface (a divider between each,
 * not their own background/border/shadow apiece). Adding a future
 * setting (difficulty, power-ups, custom rules, ...) is just another
 * DashboardCard here; no new card chrome to design each time.
 */
function DashboardCard({ title, helperText, children }: { title: string; helperText: string; children: ReactNode }) {
  return (
    <section className="host-dashboard-section">
      <h3>{title}</h3>
      {children}
      <p className="host-dashboard-section-helper">{helperText}</p>
    </section>
  );
}

/**
 * Everything that used to be split across the sidebar's Player
 * Status/Team Status blocks, now one section inside the dashboard -
 * the sidebar is permanent room info only (QR, code, Open Stage); live
 * room state belongs here, in exactly one place. Solo mode shows a flat
 * avatar+name roster; Team mode groups the same Players by Team, plus a
 * "Waiting for Team" group for anyone unassigned. All from data this
 * component already holds (presence
 * `joinedPlayers` for the live count, DB-backed `teamPlayers` for Team
 * assignment) - no new subscriptions.
 */
function RoomStatusSection({
  competitionStyle,
  joinedPlayers,
  teams,
  teamPlayers,
}: {
  competitionStyle: CompetitionStyle;
  joinedPlayers: RoomPlayer[];
  teams: TeamRecord[];
  teamPlayers: PlayerRecord[];
}) {
  const unassigned = teamPlayers.filter((player) => !player.teamId);

  return (
    <section className="host-dashboard-section">
      <h3>Room Status</h3>
      <p className="host-room-status-count" role="status">
        {joinedPlayers.length} Player{joinedPlayers.length === 1 ? "" : "s"} Connected
      </p>

      {competitionStyle === "team" ? (
        <>
          <p className="host-room-status-count">
            {teams.length} Team{teams.length === 1 ? "" : "s"} Formed
          </p>
          {teams.map((team) => (
            <div className="host-room-status-group" key={team.id}>
              <p className="host-room-status-group-name">{team.name}</p>
              <ul className="host-room-status-roster">
                {teamPlayers
                  .filter((player) => player.teamId === team.id)
                  .map((player) => (
                    <li key={player.clientId}>
                      <span aria-hidden="true">{avatarForClientId(player.clientId)}</span> {player.displayName}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {unassigned.length > 0 && (
            <div className="host-room-status-group">
              <p className="host-room-status-group-name">Waiting for Team</p>
              <ul className="host-room-status-roster">
                {unassigned.map((player) => (
                  <li key={player.clientId}>
                    <span aria-hidden="true">{avatarForClientId(player.clientId)}</span> {player.displayName}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <ul className="host-room-status-roster">
          {joinedPlayers.map((player) => (
            <li key={player.clientId}>
              <span aria-hidden="true">{avatarForClientId(player.clientId)}</span> {player.displayName}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Values are architected around deck-ownership-aware scoring that isn't
 * implemented yet (see HostParticipation's doc comment in gamePlan.ts) -
 * this milestone only adds the field and its realtime sync.
 */
function HostParticipationPicker({
  value,
  onChange,
}: {
  value: HostParticipation;
  onChange: (value: HostParticipation) => void;
}) {
  return (
    <fieldset className="host-style-picker">
      <legend className="sr-only-label">Host Participation</legend>
      <label>
        <input
          type="radio"
          name="host-participation"
          checked={value === "playing_host"}
          onChange={() => onChange("playing_host")}
        />
        Host Plays
      </label>
      <label>
        <input
          type="radio"
          name="host-participation"
          checked={value === "host_only"}
          onChange={() => onChange("host_only")}
        />
        Host Doesn&rsquo;t Play
      </label>
    </fieldset>
  );
}

function QuestionTimerSelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <select
      className="host-dashboard-select"
      aria-label="Question Timer"
      value={value === null ? "none" : String(value)}
      onChange={(event) => onChange(event.target.value === "none" ? null : Number(event.target.value))}
    >
      <option value="none">No Timer</option>
      {QUESTION_TIMER_OPTIONS_SECONDS.map((seconds) => (
        <option key={seconds} value={seconds}>
          {seconds} Seconds
        </option>
      ))}
    </select>
  );
}

function QuestionFlowPicker({ value, onChange }: { value: QuestionFlow; onChange: (value: QuestionFlow) => void }) {
  return (
    <fieldset className="host-style-picker">
      <legend className="sr-only-label">Question Flow</legend>
      <label>
        <input
          type="radio"
          name="question-flow"
          checked={value === "host_controlled"}
          onChange={() => onChange("host_controlled")}
        />
        Host Controlled
      </label>
      <label>
        <input type="radio" name="question-flow" checked={value === "automatic"} onChange={() => onChange("automatic")} />
        Automatic
      </label>
    </fieldset>
  );
}

/**
 * Stage 2 - the only remaining pre-game stage, and the last stop before
 * gameplay: configuring the game (or, for a Play-Again rematch, just
 * reviewing the locked plan). Laid out as a dashboard rather than one
 * long form: a persistent left sidebar (join info, readiness, Start
 * Game) stays visible the whole time, while the right side breaks
 * every configurable option into its own card. Everything here (Decks,
 * Question Timer, Question Flow, competition style, Host Participation)
 * remains live-editable right up until Start Game is pressed - there is
 * no separate confirmation checkpoint. Start Game is what validates,
 * freezes, and locks the final Game Plan (see migration 0007 - that's
 * also the moment competition style locks). Back to Invite is a pure
 * view toggle back to the QR screen; it never touches anything already
 * configured here.
 */

/**
 * The fixed left room panel - permanent room info only (QR, code, Live
 * status, Open Stage), identical wherever it's used. Shared between
 * GameSetupPhase and InviteLobbyPhase (its only two callers) precisely
 * so it's the same component, not two hand-copies that could quietly
 * drift apart: press Continue on the Invite Lobby or Back to Invite in
 * Game Setup and this panel doesn't move, resize, or re-render
 * differently, because it's the exact same tree either way. Back to
 * Invite is the one piece that's contextual - shown in Game Setup (to
 * return to the Invite Lobby) and omitted on the Invite Lobby itself
 * (there's nowhere to "back" to from the first screen).
 */
function HostRoomPanel({
  roomCode,
  joinUrl,
  stageUrl,
  connectionStatus,
  showBackToInvite,
  onReturnToInvite,
  returningToInvite,
  returnError,
  busy,
}: {
  roomCode: string;
  joinUrl: string;
  stageUrl: string;
  connectionStatus: string;
  showBackToInvite: boolean;
  onReturnToInvite?: () => void;
  returningToInvite?: boolean;
  returnError?: string | null;
  busy?: boolean;
}) {
  return (
    <aside className="host-dashboard-sidebar card">
      {showBackToInvite && (
        <button
          type="button"
          className="btn btn-ghost host-dashboard-back"
          onClick={onReturnToInvite}
          disabled={returningToInvite || busy}
        >
          {returningToInvite ? "Returning…" : "‹ Back to Invite"}
        </button>
      )}
      {returnError && (
        <p className="host-style-note" role="alert">
          {returnError}
        </p>
      )}

      <div className="host-dashboard-sidebar-identity">
        <div className="invite-qr">
          <RoomQrCode joinUrl={joinUrl} size={110} />
        </div>
        <p className="host-lobby-code">
          Room Code: <strong>{roomCode}</strong>
        </p>
        <p className="host-sidebar-live" role="status">
          <span className="host-sidebar-live-dot" aria-hidden="true" />
          {connectionStatus === "connected" ? "Live" : describeStatus(connectionStatus)}
        </p>
      </div>

      <a href={stageUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
        Open Stage
      </a>
    </aside>
  );
}

function GameSetupPhase({
  roomCode,
  joinUrl,
  stageUrl,
  connectionStatus,
  competitionStyle,
  onChangeStyle,
  styleError,
  joinedPlayers,
  teams,
  teamPlayers,
  deckSnapshot,
  teamReadinessProblem,
  onSetHostParticipation,
  availableDecks,
  setupSelectedDeckIds,
  onChangeSelection,
  setupQuestionTimerSeconds,
  onChangeQuestionTimer,
  setupQuestionFlow,
  onChangeQuestionFlow,
  setupStatus,
  onRetrySetup,
  onReturnToInvite,
  returningToInvite,
  returnError,
  onStart,
  starting,
  startError,
}: {
  roomCode: string;
  joinUrl: string;
  stageUrl: string;
  connectionStatus: string;
  competitionStyle: CompetitionStyle;
  onChangeStyle: (style: CompetitionStyle) => void;
  styleError: string | null;
  joinedPlayers: RoomPlayer[];
  teams: TeamRecord[];
  teamPlayers: PlayerRecord[];
  deckSnapshot: RoomDeckSnapshot;
  teamReadinessProblem: string | null;
  onSetHostParticipation: (value: HostParticipation) => void;
  availableDecks: DeckEntry[] | null;
  setupSelectedDeckIds: string[];
  onChangeSelection: (selectedDeckIds: string[]) => void;
  setupQuestionTimerSeconds: number | null;
  onChangeQuestionTimer: (value: number | null) => void;
  setupQuestionFlow: QuestionFlow;
  onChangeQuestionFlow: (value: QuestionFlow) => void;
  setupStatus: SaveStatus;
  onRetrySetup: () => void;
  onReturnToInvite: () => void;
  returningToInvite: boolean;
  returnError: string | null;
  onStart: () => void;
  starting: boolean;
  startError: string | null;
}) {
  const isRematch = deckSnapshot.kind === "game_plan";
  const hostParticipation = deckSnapshot.hostParticipation;
  const [pickerOpen, setPickerOpen] = useState(false);

  // An empty Deck selection is never blocked - it just means Quick Play
  // (the built-in sample Questions), which is always a valid, ready-to-
  // start configuration. The only thing worth blocking on here is a
  // save still in flight, so Start Game can never race ahead of it.
  const startBlockedReason =
    teamReadinessProblem ?? (!isRematch && setupStatus === "saving" ? "Saving the latest setup…" : null);

  // Computed once here (not inside SelectedDecksPanel) so this exact
  // same summary can also drive the Game Summary card below without
  // running the same computation twice or risking the two drifting.
  const entryById = new Map((availableDecks ?? []).map((entry) => [entry.deck.id, entry]));
  const selectedEntries = setupSelectedDeckIds
    .map((id) => entryById.get(id))
    .filter((entry): entry is DeckEntry => entry !== undefined);
  const planSummary = computePlanSummary(
    selectedEntries.map(({ deck, questions }) => ({ deckId: deck.id, deckTitle: deck.title, questions })),
  );

  const questionFlowHelperText =
    setupQuestionFlow === "host_controlled"
      ? "The Host manually starts each question timer when everyone is ready."
      : "The timer begins automatically as soon as the next question appears.";

  return (
    <div className="host-dashboard">
      <HostRoomPanel
        roomCode={roomCode}
        joinUrl={joinUrl}
        stageUrl={stageUrl}
        connectionStatus={connectionStatus}
        showBackToInvite={!isRematch}
        onReturnToInvite={onReturnToInvite}
        returningToInvite={returningToInvite}
        returnError={returnError}
        busy={starting}
      />

      <div className="host-dashboard-main">
        <div className="host-dashboard-panel card">
          <div className="host-dashboard-content">
            <div className="host-dashboard-header">
              <div>
                <p className="host-dashboard-eyebrow">Host Dashboard</p>
                <h2>Preparing Today&rsquo;s Game</h2>
              </div>
              {!isRematch && <SetupSaveStatusBadge status={setupStatus} onRetry={onRetrySetup} />}
            </div>

            <RoomStatusSection
              competitionStyle={competitionStyle}
              joinedPlayers={joinedPlayers}
              teams={teams}
              teamPlayers={teamPlayers}
            />

            {isRematch ? (
              <>
                <RematchSummary plan={deckSnapshot} />
                <p className="host-lobby-status">
                  Competition: <strong>{competitionStyle === "team" ? "Teams" : "Solo"}</strong>
                </p>
                <p className="host-lobby-status">
                  Host: <strong>{hostParticipation === "playing_host" ? "Playing" : "Dedicated Host"}</strong>
                </p>
              </>
            ) : (
              <>
                <DashboardCard
                  title="Competition"
                  helperText="Choose whether players compete individually or in teams."
                >
                  <CompetitionStylePicker value={competitionStyle} onChange={onChangeStyle} />
                  {styleError && (
                    <p className="host-style-note" role="alert">
                      {styleError}
                    </p>
                  )}
                </DashboardCard>

                <DashboardCard title="Decks" helperText="Select one or more decks to build your trivia game.">
                  {availableDecks === null ? (
                    <p className="host-lobby-status">Loading your Decks...</p>
                  ) : (
                    <SelectedDecksPanel
                      availableDecks={availableDecks}
                      selectedDeckIds={setupSelectedDeckIds}
                      onChangeSelection={onChangeSelection}
                      onOpenPicker={() => setPickerOpen(true)}
                      planSummary={planSummary}
                    />
                  )}
                </DashboardCard>

                <DashboardCard title="Question Timer" helperText="Sets the time players have to answer each question.">
                  <QuestionTimerSelect value={setupQuestionTimerSeconds} onChange={onChangeQuestionTimer} />
                </DashboardCard>

                <DashboardCard title="Question Flow" helperText={questionFlowHelperText}>
                  <QuestionFlowPicker value={setupQuestionFlow} onChange={onChangeQuestionFlow} />
                </DashboardCard>

                <DashboardCard
                  title="Host Participation"
                  helperText="Choose whether the Host joins the game as a player or simply runs the trivia."
                >
                  <HostParticipationPicker value={hostParticipation} onChange={onSetHostParticipation} />
                </DashboardCard>

                <GameSummaryCard
                  planSummary={planSummary}
                  competitionStyle={competitionStyle}
                  questionTimerSeconds={setupQuestionTimerSeconds}
                  questionFlow={setupQuestionFlow}
                  hostParticipation={hostParticipation}
                />

                <DeckPicker
                  open={pickerOpen}
                  decks={availableDecks}
                  selectedDeckIds={setupSelectedDeckIds}
                  onChangeSelection={onChangeSelection}
                  onClose={() => setPickerOpen(false)}
                />
              </>
            )}

            {/* A genuine failed Start Game attempt (a real error from the
                server, not a proactive validation state) - kept out of
                the floating action button itself, which is Start Game
                and nothing else, but still needs to surface *somewhere*,
                or a failed click would go silently unexplained. */}
            {startError && (
              <p className="host-style-note" role="alert">
                {startError}
              </p>
            )}

            <button
              type="button"
              className="btn btn-primary host-floating-action"
              onClick={onStart}
              disabled={startBlockedReason !== null || starting || returningToInvite}
            >
              {starting ? "Starting…" : isRematch ? "Start Rematch" : "Start Game"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The Live Game Control Center - the screen a Host spends the entire
 * game actively watching, so it's held to a different standard than
 * every other phase: a header plus a two-column body sized to the
 * viewport itself, not a centred card floating in .host-lobby's own
 * generic padding (see .live-game's own doc comment in the CSS for
 * how it opts out of that).
 *
 * Question and Reveal are two states of this ONE component, not two
 * screens - `revealed` switches what the primary action button and
 * the left monitor panel show, but every wrapping element (.live-game,
 * .live-game-header, .live-game-question, .live-game-monitor, the
 * floating action button itself) is rendered unconditionally at the
 * same position in the same tree every time. That's what keeps the
 * header, the two-column ratio, and both panels' size/position
 * pixel-identical across the Reveal Answer press - React reconciles
 * in place instead of swapping in a differently-shaped screen, so
 * there is no layout jump, no remount, and a focused control (e.g.
 * the primary action button itself) never loses focus.
 *
 * The Question Card is a pure content container - title and answer
 * options only, sized so every option is visible at once with no
 * internal scrollbar (see .live-game-question's own doc comment in
 * the CSS). The primary action lives outside the card entirely, as
 * a `.host-floating-action` - the exact same fixed bottom-right
 * button already used by Invite Lobby/Game Setup/Leaderboard, not a
 * card-level or page-level footer bar. The correct-answer treatment
 * (Multiple Choice's highlighted "is-correct" option, Typed Answer's
 * host-only answer key) was already Host-only information shown from
 * the moment the Question started, not something Reveal newly
 * unlocks - so unlike the left panel nothing about it needs to change
 * when `revealed` flips.
 *
 * Left panel: Answered/Waiting roster before Reveal, Correct/
 * Incorrect/No Answer/Pending Review results after - both are pure
 * client-side groupings of the same already-fetched answers (see
 * HostControlPanelPage's own resultStatusByCompetitorId comment), not
 * a second grading system. Pause/Resume Timer only ever renders
 * pre-Reveal - answers are locked by the time Reveal exists, so there
 * is no legitimate timer action left to offer.
 */
function LiveGamePhase({
  question,
  sectionInfo,
  questionNumber,
  totalQuestions,
  revealed,
  isTeamMode,
  answeredCompetitors,
  waitingCompetitors,
  correctCompetitors,
  incorrectCompetitors,
  pendingReviewCompetitors,
  noAnswerCompetitors,
  unitLabel,
  questionTimerSeconds,
  questionFlow,
  timerStatus,
  remainingSeconds,
  onStartTimer,
  onPauseTimer,
  onResumeTimer,
  timerActionBusy,
  timerActionError,
  onReveal,
  revealing,
  revealError,
  pendingItems,
  busyReviewId,
  onReview,
  onContinue,
  continueLabel,
}: {
  question: Question;
  sectionInfo: { section: { deckTitle: string }; sectionNumber: number; totalSections: number } | null;
  questionNumber: number;
  totalQuestions: number;
  revealed: boolean;
  isTeamMode: boolean;
  answeredCompetitors: Competitor[];
  waitingCompetitors: Competitor[];
  correctCompetitors: Competitor[];
  incorrectCompetitors: Competitor[];
  pendingReviewCompetitors: Competitor[];
  noAnswerCompetitors: Competitor[];
  unitLabel: string;
  questionTimerSeconds: number | null;
  questionFlow: QuestionFlow;
  timerStatus: TimerStatus;
  remainingSeconds: number | null;
  onStartTimer: () => void;
  onPauseTimer: () => void;
  onResumeTimer: () => void;
  timerActionBusy: boolean;
  timerActionError: string | null;
  onReveal: () => void;
  revealing: boolean;
  revealError: string | null;
  pendingItems: PendingReviewItem[];
  busyReviewId: string | null;
  onReview: (id: string, decision: "correct" | "incorrect") => void;
  onContinue: () => void;
  continueLabel: string;
}) {
  const hasTimer = questionTimerSeconds !== null;
  const categoryLabel = sectionInfo
    ? `${sectionInfo.section.deckTitle} · Deck ${sectionInfo.sectionNumber} of ${sectionInfo.totalSections}`
    : "Quick Play";
  const rosterLimit = useRosterLimit();
  const totalResultCompetitors =
    correctCompetitors.length + incorrectCompetitors.length + pendingReviewCompetitors.length + noAnswerCompetitors.length;
  const resultSummary = [
    correctCompetitors.length > 0 && `${correctCompetitors.length} Correct`,
    incorrectCompetitors.length > 0 && `${incorrectCompetitors.length} Incorrect`,
    noAnswerCompetitors.length > 0 && `${noAnswerCompetitors.length} No Answer`,
    pendingReviewCompetitors.length > 0 && `${pendingReviewCompetitors.length} Pending Review`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <div className="live-game">
      <header className="live-game-header">
        <div>
          <p className="live-game-eyebrow">
            Question {questionNumber} of {totalQuestions}
          </p>
          <p className="live-game-category">{categoryLabel}</p>
        </div>
        {hasTimer && remainingSeconds !== null && (
          <p className={`live-game-timer${remainingSeconds <= 10 ? " is-urgent" : ""}`} role="status">
            <span aria-hidden="true">⏱</span>
            {formatCountdown(remainingSeconds)}
          </p>
        )}
      </header>

      {/* DOM order deliberately matches the brief's own "Information
          Hierarchy" (question -> answers -> primary action -> player
          monitor) on every viewport, so keyboard/screen-reader order
          never disagrees with what's on screen at any width - only the
          *visual* position of .live-game-monitor changes at the
          desktop breakpoint (see .live-game's own grid-template-areas
          in the CSS), not its place in the document. The Question Card
          is now a pure content container - title, answer options, and
          (for Typed Answer) the host-only answer key - sized so all of
          it is visible at once, with no internal scroll container; the
          primary action lives outside it entirely (see
          .host-floating-action below), the same pattern already used
          by Invite Lobby/Game Setup/Leaderboard's Continue/Start Game/
          Show Winner buttons, not a page/card-level footer bar. */}
      <section className="live-game-question" aria-label="Question">
        <h2 className="live-game-question-prompt">{question.prompt}</h2>

        <div className="live-game-question-answers">
          {question.answerMethod === "multiple_choice" ? (
            <div className="live-game-answers">
              {question.options.map((option, index) => (
                <div
                  key={option.id}
                  className={`live-game-answer-card${option.id === question.correctOptionId ? " is-correct" : ""}`}
                >
                  <span className="live-game-answer-letter" aria-hidden="true">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="live-game-answer-text">{option.text}</span>
                  {option.id === question.correctOptionId && (
                    <span className="live-game-answer-correct-tag">Correct</span>
                  )}
                </div>
              ))}
            </div>
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
        </div>

        {revealed && question.answerMethod === "typed_answer" && pendingItems.length > 0 && (
          <TypedAnswerReviewQueue items={pendingItems} question={question} busyItemId={busyReviewId} onReview={onReview} />
        )}

        {!revealed && revealError && (
          <p className="host-style-note" role="alert">
            {revealError}
          </p>
        )}
      </section>

      {/* Same floating action every other Host screen uses (Continue /
          Start Game / Show Winner) - reused verbatim, only the label
          and click handler change here. Only ever one of these three
          renders at a time: Reveal Answer before Reveal; a ghost
          "Continue Anyway" while Typed Answer review is still
          outstanding (scores could still change); Next Question/
          Finish Game once every submission is finally graded. */}
      {!revealed ? (
        <button type="button" className="btn btn-primary host-floating-action" onClick={onReveal} disabled={revealing}>
          {revealing ? "Revealing…" : "Reveal Answer"}
        </button>
      ) : pendingItems.length > 0 ? (
        <button type="button" className="btn btn-ghost host-floating-action" onClick={onContinue}>
          Continue Anyway — Scores May Still Change
        </button>
      ) : (
        <button type="button" className="btn btn-primary host-floating-action" onClick={onContinue}>
          {continueLabel}
        </button>
      )}

      <aside
        className="live-game-monitor"
        aria-label={revealed ? (isTeamMode ? "Team Results" : "Player Results") : isTeamMode ? "Teams" : "Players"}
      >
        <h3 className="live-game-monitor-title">
          {revealed ? (isTeamMode ? "Team Results" : "Player Results") : isTeamMode ? "Teams" : "Players"}
        </h3>

        {!revealed ? (
          <>
            <div className="live-game-monitor-list">
              {waitingCompetitors.length === 0 ? (
                <p className="live-game-monitor-all-done">
                  <span aria-hidden="true">✓</span> Everyone has answered
                </p>
              ) : (
                <>
                  {answeredCompetitors.length > 0 && (
                    <div className="live-game-monitor-group">
                      <p className="live-game-monitor-group-label">Answered</p>
                      <ul>
                        {answeredCompetitors.map((competitor) => (
                          <li key={competitor.id} className="live-game-monitor-row is-answered">
                            <span aria-hidden="true">✓</span>
                            {competitor.displayName}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="live-game-monitor-group">
                    <p className="live-game-monitor-group-label">Waiting</p>
                    <ul>
                      {waitingCompetitors.map((competitor) => (
                        <li key={competitor.id} className="live-game-monitor-row is-waiting">
                          <span aria-hidden="true">⏳</span>
                          {competitor.displayName}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>

            {hasTimer && (
              <div className="live-game-monitor-timer">
                {timerStatus === "paused" && <p className="live-game-monitor-note">Timer paused by Host.</p>}
                {timerStatus === "expired" && <p className="live-game-monitor-note">All answers locked.</p>}
                {timerActionError && (
                  <p className="host-style-note" role="alert">
                    {timerActionError}
                  </p>
                )}
                {timerStatus === "not_started" && questionFlow === "host_controlled" && (
                  <button type="button" className="btn btn-secondary" onClick={onStartTimer} disabled={timerActionBusy}>
                    {timerActionBusy ? "Starting…" : "Start Timer"}
                  </button>
                )}
                {timerStatus === "running" && (
                  <button type="button" className="btn btn-secondary" onClick={onPauseTimer} disabled={timerActionBusy}>
                    {timerActionBusy ? "Pausing…" : "Pause Timer"}
                  </button>
                )}
                {timerStatus === "paused" && (
                  <button type="button" className="btn btn-secondary" onClick={onResumeTimer} disabled={timerActionBusy}>
                    {timerActionBusy ? "Resuming…" : "Resume Timer"}
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="live-game-monitor-list">
            {totalResultCompetitors === 0 ? (
              <p className="live-game-monitor-note">No {unitLabel}s to show yet.</p>
            ) : (
              <>
                <p className="live-game-monitor-summary" role="status">
                  {resultSummary}
                </p>
                <LiveGameResultGroup
                  label="Correct"
                  icon="✓"
                  variant="correct"
                  competitors={correctCompetitors}
                  limit={rosterLimit}
                />
                <LiveGameResultGroup
                  label="Incorrect"
                  icon="✕"
                  variant="incorrect"
                  competitors={incorrectCompetitors}
                  limit={rosterLimit}
                />
                <LiveGameResultGroup
                  label="No Answer"
                  icon="○"
                  variant="no-answer"
                  competitors={noAnswerCompetitors}
                  limit={rosterLimit}
                />
                <LiveGameResultGroup
                  label="Pending Review"
                  icon="?"
                  variant="pending"
                  competitors={pendingReviewCompetitors}
                  limit={rosterLimit}
                />
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

/**
 * One outcome group inside the post-Reveal result monitor - the icon
 * lives on the group's own label (e.g. "✓ Correct"), not repeated on
 * every row, since the label already carries the icon+text pairing
 * accessibility needs (see LiveGamePhase's own doc comment); names
 * underneath are plain, associated with that heading by simple DOM
 * proximity. Truncates to `limit` (the same viewport-based
 * useRosterLimit every other roster in this app uses) with a reused
 * "+N more" treatment - the summary line above still gives the Host
 * the true total even when a group's own list is cut short, so no
 * count is ever silently hidden. Renders nothing for an empty group,
 * the same convention every other conditional section on this screen
 * follows.
 */
function LiveGameResultGroup({
  label,
  icon,
  variant,
  competitors,
  limit,
}: {
  label: string;
  icon: string;
  variant: "correct" | "incorrect" | "no-answer" | "pending";
  competitors: Competitor[];
  limit: number;
}) {
  if (competitors.length === 0) return null;
  const visible = competitors.slice(0, limit);
  const hiddenCount = competitors.length - visible.length;

  return (
    <div className="live-game-monitor-group">
      <p className={`live-game-monitor-group-label is-${variant}`}>
        <span aria-hidden="true">{icon}</span> {label}
      </p>
      <ul>
        {visible.map((competitor) => (
          <li key={competitor.id} className="live-game-monitor-row">
            {competitor.displayName}
          </li>
        ))}
        {hiddenCount > 0 && (
          <li className="live-game-monitor-row host-roster-more">+{hiddenCount} more</li>
        )}
      </ul>
    </div>
  );
}

function TypedAnswerReviewQueue({
  items,
  question,
  busyItemId,
  onReview,
}: {
  items: PendingReviewItem[];
  question: TypedAnswerQuestion;
  busyItemId: string | null;
  onReview: (id: string, decision: "correct" | "incorrect") => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="host-review-queue">
      <h3>
        Possible typo{items.length === 1 ? "" : "s"} - {items.length} to review
      </h3>
      <ul>
        {items.map((item) => {
          const busy = busyItemId === item.id;
          return (
            <li key={item.id} className="host-review-item">
              <p>
                <strong>{item.competitorName}</strong> answered:
              </p>
              <p className="host-review-submitted">&ldquo;{item.submittedText}&rdquo;</p>
              <p className="host-lobby-status">Correct answer: &ldquo;{question.correctAnswer}&rdquo;</p>
              <div className="host-review-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onReview(item.id, "correct")}
                  disabled={busy}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onReview(item.id, "incorrect")}
                  disabled={busy}
                >
                  Reject
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The Host's standings screen - a thin, Host-specific wrapper around
 * the shared `LeaderboardScreen` (see that component's own doc
 * comment for why it's shared with the Player page verbatim). This
 * wrapper owns exactly the Host-only moderation concern: whether a
 * pending Typed Answer review is currently blocking Show Winner, and
 * if so, showing `TypedAnswerReviewQueue` in the footer slot instead
 * of the button. Everything about the standings themselves (header,
 * winner banner, ranked list) lives in `LeaderboardScreen` now, not
 * here.
 */
function HostLeaderboardPhase({
  ended,
  competitors,
  unitLabel,
  totalQuestions,
  winnerIds,
  pendingItems,
  busyReviewId,
  question,
  onReview,
  onShowWinner,
  onPlayAgain,
}: {
  ended: boolean;
  competitors: Competitor[];
  unitLabel: string;
  totalQuestions: number;
  winnerIds: string[];
  pendingItems: PendingReviewItem[];
  busyReviewId: string | null;
  question: Question | null;
  onReview: (id: string, decision: "correct" | "incorrect") => void;
  onShowWinner: () => void;
  onPlayAgain: () => void;
}) {
  const reviewBlocking = !ended && pendingItems.length > 0 && question?.answerMethod === "typed_answer";

  return (
    <LeaderboardScreen
      ended={ended}
      competitors={competitors}
      unitLabel={unitLabel}
      totalQuestions={totalQuestions}
      winnerIds={winnerIds}
      footer={
        reviewBlocking ? (
          <div className="host-leaderboard-review">
            <p className="host-lobby-status" role="status">
              {pendingItems.length} answer{pendingItems.length === 1 ? "" : "s"} still need review before the winner
              can be shown.
            </p>
            <TypedAnswerReviewQueue
              items={pendingItems}
              question={question as TypedAnswerQuestion}
              busyItemId={busyReviewId}
              onReview={onReview}
            />
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary host-floating-action"
            onClick={ended ? onPlayAgain : onShowWinner}
          >
            {ended ? "Play Again" : "Show Winner"}
          </button>
        )
      }
    />
  );
}

export default HostControlPanelPage;
