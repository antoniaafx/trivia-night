import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useClientId } from "../hooks/useClientId";
import { useCreatorId } from "../hooks/useCreatorId";
import { useRoomChannel } from "../hooks/useRoomChannel";
import { useGameRoom } from "../hooks/useGameRoom";
import { useAutosaveController, type SaveStatus } from "../hooks/useAutosaveController";
import { useCountdown } from "../hooks/useCountdown";
import { formatCountdown } from "../utils/timer";
import { getNextQuestionId, getQuestionById, QUESTIONS, type Question, type TypedAnswerQuestion } from "../data/questions";
import { computeAggregateReveal, computeWinners } from "../utils/scoring";
import {
  computePlanSummary,
  findSectionForQuestion,
  QUESTION_FLOW_DEFAULT,
  type HostParticipation,
  type PlannedGamePlanSummary,
  type QuestionFlow,
  type RoomDeckSnapshot,
} from "../utils/gamePlan";
import { QUESTION_TIMER_OPTIONS_SECONDS, QUESTION_TIMER_SECONDS_DEFAULT } from "../config/timingEstimates";
import { buildJoinUrl, buildStageUrl } from "../utils/roomLinks";
import { avatarForClientId } from "../utils/avatars";
import { fetchDecksWithQuestions } from "../services/deckRepository";
import RoomQrCode from "../components/RoomQrCode";
import LoadingScreen from "../components/LoadingScreen";
import CompetitorLeaderboard from "../components/CompetitorLeaderboard";
import SelectedDecksPanel from "../components/SelectedDecksPanel";
import DeckPicker from "../components/DeckPicker";
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
        <InviteLobbyCard
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

      {!(room.phase === "lobby" && (lobbyStage === "invite" || lobbyStage === "setup")) && (
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

      {room.phase === "question" && question && (
        <QuestionPhase
          question={question}
          sectionInfo={sectionInfo}
          questionNumber={questionNumber}
          totalQuestions={questionList.length}
          answeredCount={gradedAnswers.length}
          totalCompetitors={totalCompetitors}
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
        />
      )}

      {room.phase === "question" && !question && (
        <div className="host-phase card">
          <p className="host-phase-label">Question</p>
          <p className="host-lobby-status" role="status">
            Catching up with the current Question…
          </p>
        </div>
      )}

      {room.phase === "reveal" && question && (
        <RevealPhase
          question={question}
          answers={gradedAnswers}
          pendingItems={pendingItems}
          busyReviewId={busyReviewId}
          onReview={(id, decision) => void handleReview(id, decision)}
          onContinue={() => void (nextQuestionId ? advanceQuestion() : showLeaderboard())}
          continueLabel={nextQuestionId ? "Continue to Next Question" : "Show Leaderboard"}
        />
      )}

      {room.phase === "reveal" && !question && (
        <div className="host-phase card">
          <p className="host-phase-label">Reveal</p>
          <p className="host-lobby-status" role="status">
            Catching up with the reveal…
          </p>
        </div>
      )}

      {room.phase === "leaderboard" && (
        <LeaderboardPhase
          competitors={competitors}
          unitLabel={unitLabel}
          pendingItems={pendingItems}
          busyReviewId={busyReviewId}
          question={question}
          onReview={(id, decision) => void handleReview(id, decision)}
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
 * How many joined Players to show as name chips before summarizing the
 * rest as "+N more" - deliberately viewport-based (see useRosterLimit)
 * so the card never grows into its own scroll container: a chip row
 * wraps to at most a couple of lines at any of these limits, instead of
 * an unbounded list. Recomputed on breakpoint crossings only (matchMedia
 * "change", not a raw resize listener) since it only ever needs to
 * change at those three tiers.
 */
function computeRosterLimit(): number {
  if (window.matchMedia("(max-width: 420px)").matches) return 3;
  if (window.matchMedia("(max-width: 768px)").matches) return 4;
  return 6;
}

function useRosterLimit(): number {
  const [limit, setLimit] = useState(computeRosterLimit);

  useEffect(() => {
    const queries = [window.matchMedia("(max-width: 420px)"), window.matchMedia("(max-width: 768px)")];
    function update() {
      setLimit(computeRosterLimit());
    }
    queries.forEach((query) => query.addEventListener("change", update));
    return () => queries.forEach((query) => query.removeEventListener("change", update));
  }, []);

  return limit;
}

/**
 * Stage 1 - just getting people connected. Deliberately shows no game
 * settings at all (not even the Competition Style picker) - that's
 * Game Setup's job. Continue is always available, even with zero
 * Players, so the Host can test alone; its label makes that explicit
 * ("Continue without players") rather than implying something is
 * missing, as "Continue Anyway" used to.
 *
 * Merges what used to be two stacked cards (QR/room-code, and a
 * separate "Waiting for players..." card) into one: the QR/code/status/
 * Open Stage block and the Player count/roster/Continue block, side by
 * side on wide viewports and stacked on narrow ones (see
 * .invite-lobby-card's CSS). Every other phase still renders its own
 * simple, unmerged QR card (unchanged, see the ternary in the parent
 * component) - this merge is specific to the first thing a Host sees.
 */
function InviteLobbyCard({
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
    <div className="invite-lobby-card card">
      <div className="invite-lobby-primary">
        <div className="invite-qr">
          <RoomQrCode joinUrl={joinUrl} size={160} />
        </div>
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

      <div className="invite-lobby-secondary">
        <p className="invite-lobby-count" role="status">
          {count} Player{count === 1 ? "" : "s"} Joined
        </p>
        {count > 0 && (
          <ul className="invite-lobby-roster-list">
            {visiblePlayers.map((player) => (
              <li key={player.clientId}>{player.displayName}</li>
            ))}
            {remaining > 0 && <li className="invite-lobby-roster-more">+{remaining} more</li>}
          </ul>
        )}
        {continueError && (
          <p className="host-style-note" role="alert">
            {continueError}
          </p>
        )}
        <button type="button" className="btn btn-primary" onClick={onContinue} disabled={continuing}>
          {continuing ? "Continuing…" : continueLabel}
        </button>
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
 * Updates live as the Host changes any setting above - a final,
 * easy-to-scan overview before Start Game, never a separate
 * confirmation step. Key/value rather than a bullet list, on purpose:
 * each row pairs a fixed label with the value it currently holds, the
 * same shape as the settings above it, not restated as a sentence.
 */
function GameSummaryCard({
  planSummary,
  competitionStyle,
  questionTimerSeconds,
  questionFlow,
  hostParticipation,
}: {
  planSummary: PlannedGamePlanSummary;
  competitionStyle: CompetitionStyle;
  questionTimerSeconds: number | null;
  questionFlow: QuestionFlow;
  hostParticipation: HostParticipation;
}) {
  const deckLabel = planSummary.deckCount === 0 ? "Quick Play" : `${planSummary.deckCount} Selected`;
  // planSummary is computed purely from selected Decks (see
  // computePlanSummary) and is empty for Quick Play, which plays the
  // hardcoded QUESTIONS list instead - reading its real length here
  // rather than showing planSummary's (correct-but-misleading, for
  // Quick Play) 0.
  const questionCount = planSummary.deckCount === 0 ? QUESTIONS.length : planSummary.questionCount;

  const rows: [string, string][] = [
    ["Competition", competitionStyle === "team" ? "Teams" : "Solo"],
    ["Decks", deckLabel],
    ["Questions", String(questionCount)],
    ["Question Timer", questionTimerSeconds === null ? "No Timer" : `${questionTimerSeconds} Seconds`],
    ["Question Flow", questionFlow === "host_controlled" ? "Host Controlled" : "Automatic"],
    ["Host", hostParticipation === "playing_host" ? "Host Playing" : "Dedicated Host"],
  ];

  return (
    <section className="host-dashboard-section host-dashboard-summary">
      <h3>Game Summary</h3>
      <dl className="host-dashboard-summary-list">
        {rows.map(([label, value]) => (
          <div className="host-dashboard-summary-row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
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
      <aside className="host-dashboard-sidebar card">
        {!isRematch && (
          <button
            type="button"
            className="btn btn-ghost host-dashboard-back"
            onClick={onReturnToInvite}
            disabled={returningToInvite || starting}
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
                the sticky footer itself, which is Start Game and nothing
                else (see its own doc comment below), but still needs to
                surface *somewhere*, or a failed click would go silently
                unexplained. */}
            {startError && (
              <p className="host-style-note" role="alert">
                {startError}
              </p>
            )}
          </div>

          {/* The dashboard's own last child, a sibling of
              .host-dashboard-content (not nested inside its padding) -
              see .host-dashboard-start-bar's own doc comment in the CSS
              for why that's what lets it become the panel's true,
              flush, rounded bottom edge instead of a card bolted onto a
              square one. Its sticky range is still bounded by the
              panel itself, so it can never drift over content outside
              it or cover the Game Summary rows above once they've
              scrolled into view. */}
          <div className="host-dashboard-start-bar">
            <button
              type="button"
              className="btn btn-primary"
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

function QuestionPhase({
  question,
  sectionInfo,
  questionNumber,
  totalQuestions,
  answeredCount,
  totalCompetitors,
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
}: {
  question: Question;
  sectionInfo: { section: { deckTitle: string }; sectionNumber: number; totalSections: number } | null;
  questionNumber: number;
  totalQuestions: number;
  answeredCount: number;
  totalCompetitors: number;
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
}) {
  const verb = question.answerMethod === "typed_answer" ? "submitted" : "answered";
  const hasTimer = questionTimerSeconds !== null;
  const unitPlural = totalCompetitors === 1 ? unitLabel : `${unitLabel}s`;

  return (
    <div className="host-phase card">
      <p className="host-phase-label">
        Question {questionNumber} of {totalQuestions}
        {sectionInfo &&
          ` — ${sectionInfo.section.deckTitle} — Deck ${sectionInfo.sectionNumber} of ${sectionInfo.totalSections}`}
      </p>
      <h2>{question.prompt}</h2>

      {question.answerMethod === "multiple_choice" ? (
        <ul className="host-options">
          {question.options.map((option, index) => (
            <li key={option.id} className={option.id === question.correctOptionId ? "host-options-correct" : ""}>
              {String.fromCharCode(65 + index)}. {option.text}
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

      {/* A compact live readout of the state that actually matters for deciding whether to reveal now or wait. */}
      <p className="host-question-status" role="status">
        {hasTimer && remainingSeconds !== null && <span>⏱ {formatCountdown(remainingSeconds)}</span>}
        <span>
          👥 {answeredCount} / {totalCompetitors} {unitPlural} {verb}
        </span>
      </p>

      {hasTimer && timerStatus === "paused" && <p className="host-lobby-status">Timer paused by Host.</p>}
      {hasTimer && timerStatus === "expired" && <p className="host-lobby-status">All answers locked.</p>}

      {timerActionError && (
        <p className="host-style-note" role="alert">
          {timerActionError}
        </p>
      )}
      {revealError && (
        <p className="host-style-note" role="alert">
          {revealError}
        </p>
      )}

      <div className="host-question-actions">
        {hasTimer && timerStatus === "not_started" && questionFlow === "host_controlled" && (
          <button type="button" className="btn btn-secondary" onClick={onStartTimer} disabled={timerActionBusy}>
            {timerActionBusy ? "Starting…" : "Start Timer"}
          </button>
        )}
        {hasTimer && timerStatus === "running" && (
          <button type="button" className="btn btn-secondary" onClick={onPauseTimer} disabled={timerActionBusy}>
            {timerActionBusy ? "Pausing…" : "Pause"}
          </button>
        )}
        {hasTimer && timerStatus === "paused" && (
          <button type="button" className="btn btn-secondary" onClick={onResumeTimer} disabled={timerActionBusy}>
            {timerActionBusy ? "Resuming…" : "Resume"}
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={onReveal} disabled={revealing}>
          {revealing ? "Revealing…" : "Reveal Answer"}
        </button>
      </div>
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

function RevealPhase({
  question,
  answers,
  pendingItems,
  busyReviewId,
  onReview,
  onContinue,
  continueLabel,
}: {
  question: Question;
  answers: AnswerRecord[] | TeamAnswerRecord[];
  pendingItems: PendingReviewItem[];
  busyReviewId: string | null;
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
      {aggregate.answeredCount === 0 ? (
        <p className="host-aggregate">Nobody answered this one.</p>
      ) : (
        <p className="host-aggregate">
          {aggregate.correctCount} of {aggregate.correctCount + aggregate.incorrectCount} correct (
          {aggregate.percentageCorrect}%)
          {aggregate.pendingCount > 0 &&
            ` — ${aggregate.pendingCount} still being checked`}
        </p>
      )}

      {question.answerMethod === "typed_answer" && pendingItems.length > 0 && (
        <TypedAnswerReviewQueue items={pendingItems} question={question} busyItemId={busyReviewId} onReview={onReview} />
      )}

      {pendingItems.length > 0 ? (
        <button type="button" className="btn btn-ghost" onClick={onContinue}>
          Continue Anyway — Scores May Still Change
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
  busyReviewId,
  question,
  onReview,
  onShowWinner,
}: {
  competitors: Competitor[];
  unitLabel: string;
  pendingItems: PendingReviewItem[];
  busyReviewId: string | null;
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
          <TypedAnswerReviewQueue items={pendingItems} question={question} busyItemId={busyReviewId} onReview={onReview} />
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
