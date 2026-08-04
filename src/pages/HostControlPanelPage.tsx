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
import { findSectionForQuestion, type HostParticipation, type RoomDeckSnapshot } from "../utils/gamePlan";
import { formatApproximateMinutes } from "../utils/formatDuration";
import { buildJoinUrl, buildStageUrl } from "../utils/roomLinks";
import { fetchDecksWithQuestions } from "../services/deckRepository";
import PlayerList from "../components/PlayerList";
import LoadingScreen from "../components/LoadingScreen";
import CompetitorLeaderboard from "../components/CompetitorLeaderboard";
import GameSetupPanel, { type DeckEntry } from "../components/GameSetupPanel";
import DeckPicker from "../components/DeckPicker";
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
    lobbyStage,
    setCompetitionStyle,
    updateRoomSetup,
    setHostParticipation,
    advanceToSetup,
    returnToInvite,
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
      <div className="host-lobby-invite card">
        <QRCodeSVG
          value={joinUrl}
          size={180}
          bgColor="transparent"
          fgColor="#f5f3ff"
          title="Scan with a phone camera to join this game"
        />
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

      {room.phase === "lobby" && lobbyStage === "invite" && (
        <InviteLobbyPhase
          joinedPlayers={joinedPlayers}
          onContinue={() => void handleContinueToSetup()}
          continuing={stageBusy}
          continueError={stageError}
        />
      )}

      {room.phase === "lobby" && lobbyStage === "setup" && room.deckSnapshot && (
        <GameSetupPhase
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
          setupTargetDurationSeconds={setupTargetDurationSeconds}
          onChangeSelection={handleChangeSelection}
          onChangeDuration={handleChangeDuration}
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

      {room.phase === "question" && question && (
        <QuestionPhase
          question={question}
          sectionInfo={sectionInfo}
          answeredCount={gradedAnswers.length}
          totalCompetitors={totalCompetitors}
          unitLabel={unitLabel}
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

/**
 * Stage 1 - just getting people connected. Deliberately shows no game
 * settings at all (not even the Competition Style picker) - that's
 * Game Setup's job. Continue is always available, even with zero
 * Players, so the Host can test alone; its label softens to
 * "Continue Anyway" in that case as a small honesty nudge, not a block.
 */
function InviteLobbyPhase({
  joinedPlayers,
  onContinue,
  continuing,
  continueError,
}: {
  joinedPlayers: RoomPlayer[];
  onContinue: () => void;
  continuing: boolean;
  continueError: string | null;
}) {
  const continueLabel = joinedPlayers.length === 0 ? "Continue Anyway" : "Continue";

  return (
    <div className="host-phase card">
      <p className="host-phase-label">Invite Lobby</p>
      <h2>
        {joinedPlayers.length === 0
          ? "Waiting for players..."
          : `${joinedPlayers.length} player${joinedPlayers.length === 1 ? "" : "s"} joined`}
      </h2>
      <PlayerList players={joinedPlayers} emptyMessage="Waiting for players to join..." />
      {continueError && (
        <p className="host-style-note" role="alert">
          {continueError}
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={onContinue} disabled={continuing}>
        {continuing ? "Continuing…" : continueLabel}
      </button>
    </div>
  );
}

/**
 * Values are architected around deck-ownership-aware scoring that isn't
 * implemented yet (see HostParticipation's doc comment in gamePlan.ts) -
 * this milestone only adds the field, its realtime sync, and this
 * explanatory note.
 */
function HostParticipationToggle({
  value,
  onChange,
}: {
  value: HostParticipation;
  onChange: (value: HostParticipation) => void;
}) {
  const isPlaying = value === "playing_host";
  return (
    <div className="host-lobby-setup card">
      <h3>Host Participation</h3>
      <label className="host-participation-toggle">
        <input
          type="checkbox"
          checked={isPlaying}
          onChange={(event) => onChange(event.target.checked ? "playing_host" : "host_only")}
        />
        {isPlaying ? "I'm Playing Too" : "Dedicated Host"}
      </label>
      {isPlaying && (
        <p className="host-lobby-status">
          Playing-host rules will depend on whether the host already knows the Deck answers.
        </p>
      )}
    </div>
  );
}

/**
 * Stage 2 - the only remaining pre-game stage, and the last stop before
 * gameplay: configuring the game (or, for a Play-Again rematch, just
 * reviewing the locked plan) while the player count and roster stay
 * visible the whole time. Everything here (Decks, duration, competition
 * style, Host Participation) remains live-editable right up until Start
 * Game is pressed - there is no separate confirmation checkpoint. Start
 * Game is what validates, freezes, and locks the final Game Plan (see
 * migration 0007 - that's also the moment competition style locks).
 * Back to Invite is a pure view toggle back to the QR screen; it never
 * touches anything already configured here.
 */
function GameSetupPhase({
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
  setupTargetDurationSeconds,
  onChangeSelection,
  onChangeDuration,
  setupStatus,
  onRetrySetup,
  onReturnToInvite,
  returningToInvite,
  returnError,
  onStart,
  starting,
  startError,
}: {
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
  setupTargetDurationSeconds: number;
  onChangeSelection: (selectedDeckIds: string[]) => void;
  onChangeDuration: (targetDurationSeconds: number) => void;
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

  return (
    <div className="host-phase card">
      <p className="host-phase-label">Game Setup</p>

      <p className="host-setup-player-count" role="status">
        👥 {joinedPlayers.length} Player{joinedPlayers.length === 1 ? "" : "s"} Connected
      </p>
      <details className="host-setup-roster">
        <summary>{competitionStyle === "team" ? "View teams" : "View players"}</summary>
        {competitionStyle === "team" ? (
          <TeamRoster teams={teams} players={teamPlayers} />
        ) : (
          <PlayerList players={joinedPlayers} emptyMessage="Waiting for players to join..." />
        )}
      </details>

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
          <CompetitionStylePicker value={competitionStyle} onChange={onChangeStyle} />
          {styleError && (
            <p className="host-style-note" role="alert">
              {styleError}
            </p>
          )}

          <div className="host-lobby-setup">
            <div className="host-lobby-setup-header">
              <h3>Decks &amp; Duration</h3>
              <SetupSaveStatusBadge status={setupStatus} onRetry={onRetrySetup} />
            </div>
            {availableDecks === null ? (
              <p className="host-lobby-status">Loading your Decks...</p>
            ) : (
              <GameSetupPanel
                availableDecks={availableDecks}
                selectedDeckIds={setupSelectedDeckIds}
                targetDurationSeconds={setupTargetDurationSeconds}
                onChangeSelection={onChangeSelection}
                onChangeDuration={onChangeDuration}
                onOpenPicker={() => setPickerOpen(true)}
              />
            )}
          </div>

          <HostParticipationToggle value={hostParticipation} onChange={onSetHostParticipation} />

          <DeckPicker
            open={pickerOpen}
            decks={availableDecks}
            selectedDeckIds={setupSelectedDeckIds}
            onChangeSelection={onChangeSelection}
            onClose={() => setPickerOpen(false)}
          />
        </>
      )}

      {!isRematch && (
        <>
          {returnError && (
            <p className="host-style-note" role="alert">
              {returnError}
            </p>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onReturnToInvite}
            disabled={returningToInvite || starting}
          >
            {returningToInvite ? "Returning…" : "Back to Invite"}
          </button>
        </>
      )}

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
      <button
        type="button"
        className="btn btn-primary"
        onClick={onStart}
        disabled={startBlockedReason !== null || starting || returningToInvite}
      >
        {starting ? "Starting…" : isRematch ? "Start Rematch" : "Start Game"}
      </button>
    </div>
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
  revealing,
  revealError,
}: {
  question: Question;
  sectionInfo: { section: { deckTitle: string }; sectionNumber: number; totalSections: number } | null;
  answeredCount: number;
  totalCompetitors: number;
  unitLabel: string;
  onReveal: () => void;
  revealing: boolean;
  revealError: string | null;
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

      <p className="host-answered-count">
        {answeredCount} of {totalCompetitors} {unitLabel}
        {totalCompetitors === 1 ? "" : "s"} {verb}
      </p>
      {revealError && (
        <p className="host-style-note" role="alert">
          {revealError}
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={onReveal} disabled={revealing}>
        {revealing ? "Revealing…" : "Reveal Answer"}
      </button>
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
