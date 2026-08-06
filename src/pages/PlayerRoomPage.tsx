import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useClientId } from "../hooks/useClientId";
import { useRoomChannel } from "../hooks/useRoomChannel";
import { useGameRoom } from "../hooks/useGameRoom";
import { useCountdown } from "../hooks/useCountdown";
import { getQuestionById, type Question, type TypedAnswerQuestion } from "../data/questions";
import {
  findSectionForQuestion,
  type HostParticipation,
  type PlannedGamePlanSummary,
  type QuestionFlow,
  type RoomDeckSnapshot,
} from "../utils/gamePlan";
import { formatCountdown } from "../utils/timer";
import { validateTeamName } from "../utils/scoring";
import { avatarForClientId } from "../utils/avatars";
import LoadingScreen from "../components/LoadingScreen";
import GameSummaryCard from "../components/GameSummaryCard";
import LeaderboardScreen from "../components/LeaderboardScreen";
import type { RoomPlayer } from "../types/room";
import type { CompetitionStyle, Competitor, GradingStatus, PlayerRecord, TeamRecord } from "../types/game";
import { playerToCompetitor, teamToCompetitor } from "../types/game";
import "../styles/hostDashboardShell.css";
import "../styles/liveGameShell.css";
import "../styles/leaderboardShell.css";
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
    lobbyStage,
    createTeam,
    joinTeam,
    leaveTeam,
    submitAnswer,
    submitTypedAnswer,
    submitTeamAnswer,
    submitTeamTypedAnswer,
  } = useGameRoom({ roomCode, self });

  const hostPresent = presencePlayers.some((player) => player.isHost);

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
          ? "The Host changed the game to Team Play. Choose a Team before the game begins."
          : "The Host changed the game to Solo Play. You'll compete individually.",
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

  // Called unconditionally, before the early returns below, per the
  // Rules of Hooks - `room` is safely optional-chained since it may
  // still be null this early (loading, or not found).
  const remainingSeconds = useCountdown(
    room?.timerStatus ?? "not_started",
    room?.timerStartedAt ?? null,
    room?.timerRemainingSeconds ?? null,
  );

  if (connectionStatus === "unconfigured" || presenceStatus === "unconfigured") {
    return (
      <div className="player-room">
        <p className="player-room-status" role="status">
          {describeStatus("unconfigured")}
        </p>
      </div>
    );
  }

  if (loading) {
    return <LoadingScreen message="Joining room..." />;
  }

  if (roomNotFound || !room) {
    return (
      <div className="player-room">
        <h1>We couldn&rsquo;t find that room</h1>
        <p className="player-room-status">
          Double-check the room code with your host — codes are case-insensitive, but every letter counts.
        </p>
        <Link to="/join" className="btn btn-primary">
          Try a different code
        </Link>
      </div>
    );
  }

  if (isLateJoin) {
    return (
      <div className="player-room">
        <p className="player-room-status" role="status">
          {describeStatus(connectionStatus)}
        </p>
        <h1>This game is already underway.</h1>
        <p>No need to refresh — you&rsquo;ll be dropped right in as soon as the host starts the next one.</p>
      </div>
    );
  }

  const question = getQuestionById(questionList, room.currentQuestionId);
  const sectionInfo =
    room.deckSnapshot?.kind === "game_plan" ? findSectionForQuestion(room.deckSnapshot, room.currentQuestionId) : null;
  const questionNumber = questionList.findIndex((q) => q.id === room.currentQuestionId) + 1;
  const totalQuestions = questionList.length;
  const isTeamMode = room.competitionStyle === "team";
  const scorablePlayers = players.filter((player) => !player.isHost);
  const competitors: Competitor[] = isTeamMode
    ? teams.map(teamToCompetitor)
    : scorablePlayers.map(playerToCompetitor);
  const myCompetitorId = isTeamMode ? myTeamId : self.clientId;
  const unitLabel = isTeamMode ? "team" : "you";
  const hasTeam = !isTeamMode || myTeamId !== null;
  const questionTimerSeconds = room.deckSnapshot?.questionTimerSeconds ?? null;
  const answersLocked = room.timerStatus === "expired";

  return (
    <div className="player-room">
      {/* Lobby folds this same connection status into its own sidebar
          (see PlayerInfoPanel's "Status" row). Every other phase drops
          it entirely: once the game has actually begun, a Player
          already knows they're connected, and the room code/"You're
          in!" copy is exactly the kind of lobby-era information none
          of those screens should show - Question/Reveal for the
          reasons in PlayerLiveQuestionPhase's own doc comment,
          Leaderboard/Ended because they now render the exact same
          shared `LeaderboardScreen` the Host page does (see
          PlayerLeaderboardPhase's own doc comment), which has no
          such line of its own to match - showing one here would break
          the "identical layout" parity this screen exists for. */}

      {room.phase === "lobby" && (
        <PlayerLobbyPhase
          roomCode={roomCode}
          self={self}
          connectionStatus={connectionStatus}
          hostPresent={hostPresent}
          presencePlayers={presencePlayers}
          scorablePlayers={scorablePlayers}
          teams={teams}
          myTeamId={myTeamId}
          competitionStyle={room.competitionStyle}
          deckSnapshot={room.deckSnapshot}
          showTeamSelector={lobbyStage !== "invite"}
          styleChangeNotice={styleChangeNotice}
          onCreateTeam={createTeam}
          onJoinTeam={joinTeam}
          onLeaveTeam={leaveTeam}
        />
      )}

      {(room.phase === "question" || room.phase === "reveal") && question && (
        <PlayerLiveQuestionPhase
          question={question}
          sectionInfo={sectionInfo}
          questionNumber={questionNumber}
          totalQuestions={totalQuestions}
          revealed={room.phase === "reveal"}
          questionTimerSeconds={questionTimerSeconds}
          remainingSeconds={remainingSeconds}
          isTeamMode={isTeamMode}
          hasTeam={hasTeam}
          locked={answersLocked}
          selectedOptionId={isTeamMode ? myTeamAnswerOptionId : myAnswerOptionId}
          onSelectOption={(optionId) => void (isTeamMode ? submitTeamAnswer(optionId) : submitAnswer(optionId))}
          typedSubmittedText={isTeamMode ? myTeamTypedAnswerText : myTypedAnswerText}
          onSubmitTyped={(text) => (isTeamMode ? submitTeamTypedAnswer(text) : submitTypedAnswer(text))}
          gradingStatus={isTeamMode ? myTeamGradingStatus : myGradingStatus}
        />
      )}

      {(room.phase === "question" || room.phase === "reveal") && !question && (
        <p className="player-room-status" role="status">
          Catching up…
        </p>
      )}

      {(room.phase === "leaderboard" || room.phase === "ended") && (
        <PlayerLeaderboardPhase
          ended={room.phase === "ended"}
          competitors={competitors}
          unitLabel={unitLabel}
          totalQuestions={questionList.length}
          winnerIds={room.winnerIds}
          myCompetitorId={myCompetitorId}
          isTeamMode={isTeamMode}
        />
      )}
    </div>
  );
}

/**
 * The Player Lobby - the Player-side equivalent of the Host Dashboard
 * (HostControlPanelPage's GameSetupPhase), sharing its exact shell
 * (`.host-dashboard`/`.host-dashboard-sidebar`/`.host-dashboard-panel`/
 * `.host-dashboard-content`/`.host-dashboard-section`, all now defined
 * once in styles/hostDashboardShell.css - see that file's own doc
 * comment) so a Player switching screens from the Host recognizes the
 * same design system, not a similar-looking rebuild. Renders identically
 * whether the Host is still on the Invite stage or has moved on to
 * Setup - a Player has no equivalent distinction to make (they're
 * waiting either way), so unlike the Host's own two separate screens
 * this is deliberately ONE screen for the whole Lobby phase. The one
 * thing that *does* change between those two stages is whether Team
 * Selection is offered yet (`showTeamSelector`), matching the Host's
 * own existing gate (`lobbyStage !== "invite"`) rather than a new one.
 */
function PlayerLobbyPhase({
  roomCode,
  self,
  connectionStatus,
  hostPresent,
  presencePlayers,
  scorablePlayers,
  teams,
  myTeamId,
  competitionStyle,
  deckSnapshot,
  showTeamSelector,
  styleChangeNotice,
  onCreateTeam,
  onJoinTeam,
  onLeaveTeam,
}: {
  roomCode: string;
  self: RoomPlayer;
  connectionStatus: string;
  hostPresent: boolean;
  presencePlayers: RoomPlayer[];
  scorablePlayers: PlayerRecord[];
  teams: TeamRecord[];
  myTeamId: string | null;
  competitionStyle: CompetitionStyle;
  deckSnapshot: RoomDeckSnapshot | null;
  showTeamSelector: boolean;
  styleChangeNotice: string | null;
  onCreateTeam: (name: string) => Promise<TeamRecord>;
  onJoinTeam: (teamId: string) => Promise<void>;
  onLeaveTeam: () => Promise<void>;
}) {
  const myTeam = teams.find((team) => team.id === myTeamId) ?? null;
  const summary = summarizeDeckSnapshotForPlayer(deckSnapshot);

  return (
    <div className="host-dashboard">
      <PlayerInfoPanel
        self={self}
        connectionStatus={connectionStatus}
        competitionStyle={competitionStyle}
        myTeam={myTeam}
        roomCode={roomCode}
      />

      <div className="host-dashboard-main">
        <div className="host-dashboard-panel card">
          <div className="host-dashboard-content">
            <div className="host-dashboard-header">
              <div>
                <p className="host-dashboard-eyebrow">Player Lobby</p>
                <h2>Waiting for Host</h2>
              </div>
            </div>

            {connectionStatus === "connected" && !hostPresent && (
              <p className="host-style-note" role="alert">
                We haven&rsquo;t seen the host yet — double check the room code.
              </p>
            )}
            {styleChangeNotice && (
              <p className="player-room-status" role="status">
                {styleChangeNotice}
              </p>
            )}

            <PlayerWaitingStatusSection connectionStatus={connectionStatus} />

            <PlayerRosterSection
              competitionStyle={competitionStyle}
              presencePlayers={presencePlayers}
              scorablePlayers={scorablePlayers}
              teams={teams}
              selfClientId={self.clientId}
            />

            {competitionStyle === "team" && showTeamSelector && (
              <TeamSelectorSection teams={teams} myTeamId={myTeamId} onJoin={onJoinTeam} onLeave={onLeaveTeam} onCreate={onCreateTeam} />
            )}

            {summary && (
              <GameSummaryCard
                planSummary={summary.planSummary}
                competitionStyle={competitionStyle}
                questionTimerSeconds={summary.questionTimerSeconds}
                questionFlow={summary.questionFlow}
                hostParticipation={summary.hostParticipation}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PlayerGameSummary {
  planSummary: PlannedGamePlanSummary;
  hostParticipation: HostParticipation;
  questionTimerSeconds: number | null;
  questionFlow: QuestionFlow;
}

/**
 * Normalizes either shape of RoomDeckSnapshot into what the shared
 * GameSummaryCard needs. A `game_plan` snapshot during the lobby phase
 * only ever means a Play-Again rematch (see deriveLobbyStage's own doc
 * comment) - its `sections`/`questions` already have everything
 * GameSummaryCard needs, just under different field names than
 * `planned_game`'s pre-computed `planSummary`. Deliberately local to
 * this page rather than added to gamePlan.ts: the Host's own rematch
 * view (RematchSummary) is untouched and out of scope here, this only
 * gives the Player Lobby - which has no separate rematch view of its
 * own - one consistent Game Summary either way.
 */
function summarizeDeckSnapshotForPlayer(deckSnapshot: RoomDeckSnapshot | null): PlayerGameSummary | null {
  if (!deckSnapshot) return null;

  if (deckSnapshot.kind === "planned_game") {
    return {
      planSummary: deckSnapshot.planSummary,
      hostParticipation: deckSnapshot.hostParticipation,
      questionTimerSeconds: deckSnapshot.questionTimerSeconds,
      questionFlow: deckSnapshot.questionFlow,
    };
  }

  return {
    planSummary: {
      deckCount: deckSnapshot.sections.length,
      questionCount: deckSnapshot.questions.length,
      sections: deckSnapshot.sections.map((section) => ({
        deckId: section.deckId,
        deckTitle: section.deckTitle,
        selectedQuestionCount: section.questionIds.length,
      })),
    },
    hostParticipation: deckSnapshot.hostParticipation,
    questionTimerSeconds: deckSnapshot.questionTimerSeconds,
    questionFlow: deckSnapshot.questionFlow,
  };
}

/**
 * The Player's "anchor" - the Host QR panel's equivalent, but showing
 * only facts about the current Player instead of ways to invite more of
 * them (see the same `.host-dashboard-sidebar` shell's doc comment in
 * hostDashboardShell.css). Reuses the Host sidebar's own identity-block
 * shape (an eyebrow, a prominent name line, then a key/value fact list)
 * rather than inventing a new layout for it.
 */
function PlayerInfoPanel({
  self,
  connectionStatus,
  competitionStyle,
  myTeam,
  roomCode,
}: {
  self: RoomPlayer;
  connectionStatus: string;
  competitionStyle: CompetitionStyle;
  myTeam: TeamRecord | null;
  roomCode: string;
}) {
  return (
    <aside className="host-dashboard-sidebar card">
      <div className="host-dashboard-sidebar-identity">
        <p className="host-dashboard-eyebrow">You</p>
        <p className="host-lobby-code">
          <span aria-hidden="true">{avatarForClientId(self.clientId)}</span> {self.displayName}
        </p>
        <dl className="host-dashboard-summary-list player-info-facts">
          <div className="host-dashboard-summary-row">
            <dt>Status</dt>
            <dd>
              <span className="host-sidebar-live-dot player-info-status-dot" aria-hidden="true" />
              {connectionStatus === "connected" ? "Connected" : describeStatus(connectionStatus)}
            </dd>
          </div>
          <div className="host-dashboard-summary-row">
            <dt>Competition</dt>
            <dd>{competitionStyle === "team" ? "Teams" : "Solo"}</dd>
          </div>
          {competitionStyle === "team" && (
            <div className="host-dashboard-summary-row">
              <dt>Team</dt>
              <dd>{myTeam ? myTeam.name : "Not chosen yet"}</dd>
            </div>
          )}
          <div className="host-dashboard-summary-row">
            <dt>Room</dt>
            <dd>{roomCode}</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}

/**
 * "What happens next?" as a compact checklist instead of a paragraph -
 * see the redesign brief's own "Waiting Status" example. `Game Loaded`
 * is always done the moment this renders (the page's own loading guard,
 * above, already gated on `room` existing); `Waiting for Host` is
 * always pending here since this section only renders during the lobby
 * phase - neither needs its own prop, only `Connected` genuinely varies.
 */
function PlayerWaitingStatusSection({ connectionStatus }: { connectionStatus: string }) {
  const connected = connectionStatus === "connected";
  return (
    <section className="host-dashboard-section">
      <h3>Waiting Status</h3>
      <ul className="player-waiting-status">
        <li className={connected ? "is-done" : "is-pending"}>
          <span aria-hidden="true">{connected ? "✓" : "⏳"}</span>
          {connected ? "Connected" : describeStatus(connectionStatus)}
        </li>
        <li className="is-done">
          <span aria-hidden="true">✓</span>Game Loaded
        </li>
        <li className="is-pending">
          <span aria-hidden="true">⏳</span>Waiting for Host
        </li>
      </ul>
    </section>
  );
}

/**
 * "Who is in the room?" - Solo Mode reads straight off Presence (the
 * same "who's online right now" data the Host's own Invite Lobby uses),
 * so a join/leave shows up the instant it happens and the Host can
 * appear in the list (Presence is the only source that has a row for
 * the Host at all - see PlayerRecord's own doc comment: the Host never
 * gets a durable roster row). Team Mode instead groups the durable,
 * DB-backed `scorablePlayers` by `teamId`, the same shape and the same
 * "Waiting for Team" fallback group as the Host's own Room Status
 * section, since team assignment only exists in that durable data, not
 * in Presence. Never leaves the list looking empty/dead if no one else
 * has joined yet - see the trailing helper line.
 */
function PlayerRosterSection({
  competitionStyle,
  presencePlayers,
  scorablePlayers,
  teams,
  selfClientId,
}: {
  competitionStyle: CompetitionStyle;
  presencePlayers: RoomPlayer[];
  scorablePlayers: PlayerRecord[];
  teams: TeamRecord[];
  selfClientId: string;
}) {
  const realPlayers = presencePlayers.filter((player) => !player.isHost);
  const nameFor = (clientId: string, displayName: string) =>
    clientId === selfClientId ? `${displayName} (You)` : displayName;
  const unassigned = scorablePlayers.filter((player) => !player.teamId);

  return (
    <section className="host-dashboard-section">
      <h3>Players Joining</h3>
      <p className="host-room-status-count" role="status">
        {realPlayers.length} Player{realPlayers.length === 1 ? "" : "s"} Connected
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
                {scorablePlayers
                  .filter((player) => player.teamId === team.id)
                  .map((player) => (
                    <li key={player.clientId}>
                      <span aria-hidden="true">{avatarForClientId(player.clientId)}</span>{" "}
                      {nameFor(player.clientId, player.displayName)}
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
                    <span aria-hidden="true">{avatarForClientId(player.clientId)}</span>{" "}
                    {nameFor(player.clientId, player.displayName)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <ul className="host-room-status-roster">
          {presencePlayers.map((player) => (
            <li key={player.clientId}>
              <span aria-hidden="true">{avatarForClientId(player.clientId)}</span>{" "}
              {nameFor(player.clientId, player.displayName)}
            </li>
          ))}
        </ul>
      )}

      {realPlayers.length <= 1 && (
        <p className="host-dashboard-section-helper" role="status">
          Waiting for more players…
        </p>
      )}
    </section>
  );
}

/**
 * Team Selection, restyled to live inside a `.host-dashboard-section`
 * like every other part of this page instead of its own centred,
 * standalone screen - the join/leave/create logic, validation, and
 * error handling below are unchanged from before this redesign.
 */
function TeamSelectorSection({
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
      <section className="host-dashboard-section">
        <h3>Your Team</h3>
        <p className="host-dashboard-section-helper">
          You&rsquo;re on <strong>{myTeam.name}</strong>. You can switch teams until the host starts the game.
        </p>
        {error && (
          <p className="host-style-note" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => void handleLeave()} disabled={busy}>
          Leave team
        </button>
        {otherTeams.length > 0 && (
          <div className="player-team-list">
            <p className="host-dashboard-section-helper">Switch to another team</p>
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
      </section>
    );
  }

  return (
    <section className="host-dashboard-section">
      <h3>Choose a Team</h3>
      {error && (
        <p className="host-style-note" role="alert">
          {error}
        </p>
      )}
      {teams.length === 0 && <p className="host-dashboard-section-helper">No teams yet — be the first to start one!</p>}
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
    </section>
  );
}

interface PlayerSectionInfo {
  section: { deckTitle: string };
  sectionNumber: number;
  totalSections: number;
}

/**
 * The Player's own Question/Reveal screen - the read-only counterpart
 * to the Host's Live Game Control Center (HostControlPanelPage's
 * LiveGamePhase), sharing its header and Question Card verbatim (see
 * styles/liveGameShell.css's own doc comment) so a Player recognizes
 * the same design system the Host uses, not a similar-looking rebuild.
 * Unlike the Host's version this has no Player Monitor column and no
 * primary action of any kind - the Player has exactly one task
 * (answer the current Question), and moderation (Reveal Answer, timer
 * control, ...) is exclusively the Host's. `revealed` is the same
 * "two states, one component" pattern already used by `LiveGamePhase`
 * and `HostLeaderboardPhase`: every wrapping element (header, Question
 * Card) renders unconditionally at the same position in both states,
 * so pressing Reveal Answer reads as this screen continuing, not
 * navigating - only the answer area's own content and the trailing
 * status line change.
 */
function PlayerLiveQuestionPhase({
  question,
  sectionInfo,
  questionNumber,
  totalQuestions,
  revealed,
  questionTimerSeconds,
  remainingSeconds,
  isTeamMode,
  hasTeam,
  locked,
  selectedOptionId,
  onSelectOption,
  typedSubmittedText,
  onSubmitTyped,
  gradingStatus,
}: {
  question: Question;
  sectionInfo: PlayerSectionInfo | null;
  questionNumber: number;
  totalQuestions: number;
  revealed: boolean;
  questionTimerSeconds: number | null;
  remainingSeconds: number | null;
  isTeamMode: boolean;
  hasTeam: boolean;
  locked: boolean;
  selectedOptionId: string | null;
  onSelectOption: (optionId: string) => void;
  typedSubmittedText: string | null;
  onSubmitTyped: (text: string) => Promise<void>;
  gradingStatus: GradingStatus | null;
}) {
  const hasTimer = questionTimerSeconds !== null;
  const categoryLabel = sectionInfo
    ? `${sectionInfo.section.deckTitle} · Deck ${sectionInfo.sectionNumber} of ${sectionInfo.totalSections}`
    : "Quick Play";
  const submitted = selectedOptionId !== null || typedSubmittedText !== null;

  return (
    <div className="player-live-game">
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

      <section className="live-game-question" aria-label="Question">
        <h2 className="live-game-question-prompt">{question.prompt}</h2>

        <div className="live-game-question-answers">
          {isTeamMode && !hasTeam ? (
            <p className="host-style-note" role="alert">
              You didn&rsquo;t join a team before the game started.
            </p>
          ) : question.answerMethod === "multiple_choice" ? (
            <PlayerAnswerGrid
              question={question}
              revealed={revealed}
              locked={locked}
              selectedOptionId={selectedOptionId}
              onSelect={onSelectOption}
            />
          ) : (
            <PlayerTypedAnswer
              question={question}
              revealed={revealed}
              locked={locked}
              isTeamMode={isTeamMode}
              submittedText={typedSubmittedText}
              onSubmit={onSubmitTyped}
            />
          )}
        </div>

        {revealed && (!isTeamMode || hasTeam) && (
          <PlayerResultMessage question={question} isTeamMode={isTeamMode} gradingStatus={gradingStatus} />
        )}

        {!revealed && submitted && (!isTeamMode || hasTeam) && (
          <p className="player-submitted-note" role="status">
            <span aria-hidden="true">✓</span> Answer submitted — Waiting for Host&hellip;
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * Multiple Choice's answer grid - the exact same `.live-game-answer-*`
 * classes the Host's own cheat-sheet grid uses (see liveGameShell.css),
 * just applied to real `<button>`s instead of read-only `<div>`s (see
 * `.player-answer-button` in PlayerRoomPage.css for the interactive
 * reset that adds). `.is-correct` only ever applies once `revealed` is
 * true - unlike the Host, a Player must never see which option is
 * correct before the Host actually reveals it. Still clickable up
 * until Reveal (a Player may change their mind), so `.is-selected` is
 * a lighter "this is my current pick" cue, never a red/incorrect one -
 * whether it was right only exists after Reveal, and even then lives
 * in the trailing PlayerResultMessage rather than a red card (see
 * TRIVIA_NIGHT_MEMORY.md - there is no red/error token in this
 * palette).
 */
function PlayerAnswerGrid({
  question,
  revealed,
  locked,
  selectedOptionId,
  onSelect,
}: {
  question: Question;
  revealed: boolean;
  locked: boolean;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
}) {
  if (question.answerMethod !== "multiple_choice") return null;

  return (
    <div className="live-game-answers" role="radiogroup" aria-label="Answer choices">
      {question.options.map((option, index) => {
        const selected = option.id === selectedOptionId;
        const isCorrectOption = revealed && option.id === question.correctOptionId;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`live-game-answer-card player-answer-button${
              isCorrectOption ? " is-correct" : selected ? " is-selected" : ""
            }`}
            onClick={() => onSelect(option.id)}
            disabled={locked || revealed}
          >
            <span className="live-game-answer-letter" aria-hidden="true">
              {String.fromCharCode(65 + index)}
            </span>
            <span className="live-game-answer-text">{option.text}</span>
            {isCorrectOption && <span className="live-game-answer-correct-tag">Correct</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Typed Answer's pre-Reveal input (unique to the Player - the Host's
 * own Typed Answer view shows an answer key instead, which a Player
 * must never see early) vs. its post-Reveal answer-key box, which
 * *does* reuse the Host's exact `.host-typed-answer-key` styling -
 * safe now that the correct answer is public.
 */
function PlayerTypedAnswer({
  question,
  revealed,
  locked,
  isTeamMode,
  submittedText,
  onSubmit,
}: {
  question: TypedAnswerQuestion;
  revealed: boolean;
  locked: boolean;
  isTeamMode: boolean;
  submittedText: string | null;
  onSubmit: (text: string) => Promise<void>;
}) {
  if (revealed) {
    return (
      <div className="host-typed-answer-key">
        <p>
          Correct answer: <strong>{question.correctAnswer}</strong>
        </p>
      </div>
    );
  }

  return <TypedAnswerInput isTeamMode={isTeamMode} locked={locked} submittedText={submittedText} onSubmit={onSubmit} />;
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
 * asking the player to type something first. Still editable/re-
 * submittable up until Reveal, same as Multiple Choice's grid above -
 * the calmer post-submit language lives in PlayerLiveQuestionPhase's
 * own trailing "Answer submitted" line, not repeated here.
 */
function TypedAnswerInput({
  isTeamMode,
  locked,
  submittedText,
  onSubmit,
}: {
  isTeamMode: boolean;
  locked: boolean;
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
        <label htmlFor="typed-answer-input" className="sr-only-label">
          Your answer
        </label>
        <input
          id="typed-answer-input"
          type="text"
          placeholder="Type your answer"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={TYPED_ANSWER_MAX_LENGTH}
          autoComplete="off"
          disabled={busy || locked}
        />
        {error && (
          <p className="host-style-note" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || locked}>
          Submit
        </button>
      </form>
    </div>
  );
}

/**
 * The Reveal-phase result line - "Reuse the exact answer reveal
 * styling already used in the Host interface" for the *correct
 * answer itself* means the highlighted `.is-correct` card (see
 * PlayerAnswerGrid/PlayerTypedAnswer); this is the one genuinely
 * Player-only addition, a short, calm statement of the Player's own
 * outcome. Colour follows the app's existing rule (no red/error token -
 * teal for positive, orange for "needs attention"), never colour alone
 * (icon + text pairing).
 */
function PlayerResultMessage({
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

  if (gradingStatus === "correct") {
    return (
      <p className="player-result is-correct" role="status">
        <span aria-hidden="true">✓</span> Correct!
      </p>
    );
  }

  if (gradingStatus === "incorrect") {
    return (
      <div className="player-result is-incorrect" role="status">
        <p>
          <span aria-hidden="true">✕</span> Incorrect
        </p>
        <p className="player-result-detail">Correct answer: {correctAnswerText}</p>
      </div>
    );
  }

  if (gradingStatus === "pending_review") {
    return (
      <p className="player-result" role="status">
        Your answer is being checked.
      </p>
    );
  }

  return (
    <p className="player-result" role="status">
      {isTeamMode ? "Your team didn’t answer." : "You didn’t answer."}
    </p>
  );
}

/**
 * The Player's own standings screen - the read-only counterpart to the
 * Host's Leaderboard/Ended view, rendering the exact same shared
 * `LeaderboardScreen` (see that component's own doc comment). Side by
 * side with the Host page this should look like the same screen from
 * a different seat: identical header, winner banner, and ranked list,
 * differing only in the one row this Player/Team occupies (highlighted
 * via `highlightCompetitorId`/`highlightLabel`) and in the footer - a
 * plain, calm status line instead of the Host's Show Winner/Play Again
 * button, since a Player never controls when the game moves on. There
 * is no separate "you won!"/rank-recap copy anymore (the old
 * `EndedView` had its own) - the shared header ("Trivia Complete") and
 * winner banner already say everything that needs saying once, the
 * same way for both Host and Player; repeating it in Player-only prose
 * would be exactly the "separate design" this screen is meant not to
 * be. `.host-leaderboard-row.is-you` is a Player-only style (never
 * applied on the Host page - the Host is never a `Competitor`), the
 * only genuinely new visual element on this page.
 */
function PlayerLeaderboardPhase({
  ended,
  competitors,
  unitLabel,
  totalQuestions,
  winnerIds,
  myCompetitorId,
  isTeamMode,
}: {
  ended: boolean;
  competitors: Competitor[];
  unitLabel: string;
  totalQuestions: number;
  winnerIds: string[];
  myCompetitorId: string | null;
  isTeamMode: boolean;
}) {
  return (
    <LeaderboardScreen
      ended={ended}
      competitors={competitors}
      unitLabel={unitLabel}
      totalQuestions={totalQuestions}
      winnerIds={winnerIds}
      highlightCompetitorId={myCompetitorId}
      highlightLabel={isTeamMode ? "Your Team" : "You"}
      footer={
        <p className="player-leaderboard-status" role="status">
          {ended ? "Host is deciding what to do next." : "Waiting for Host…"}
        </p>
      }
    />
  );
}

export default PlayerRoomPage;
