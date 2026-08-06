import { Link, useParams } from "react-router-dom";
import { useGameRoom } from "../hooks/useGameRoom";
import { useCountdown } from "../hooks/useCountdown";
import { useRosterLimit } from "../hooks/useRosterLimit";
import { getQuestionById, type Question } from "../data/questions";
import { computeAggregateReveal } from "../utils/scoring";
import { findSectionForQuestion, summarizeDeckSnapshotForSummaryCard, type RoomDeckSnapshot } from "../utils/gamePlan";
import { formatCountdown } from "../utils/timer";
import { buildJoinUrl } from "../utils/roomLinks";
import { avatarForClientId } from "../utils/avatars";
import LoadingScreen from "../components/LoadingScreen";
import GameSummaryCard from "../components/GameSummaryCard";
import LeaderboardScreen from "../components/LeaderboardScreen";
import RoomQrCode from "../components/RoomQrCode";
import type { GradedLike } from "../utils/scoring";
import type { CompetitionStyle, Competitor, TeamRecord, TimerStatus } from "../types/game";
import type { PlayerRecord } from "../types/game";
import { playerToCompetitor, teamToCompetitor } from "../types/game";
import "../styles/hostDashboardShell.css";
import "../styles/leaderboardShell.css";
import "./StagePage.css";

interface StageSectionInfo {
  section: { deckTitle: string };
  sectionNumber: number;
  totalSections: number;
}

/**
 * The shared display, read from across a room - the presentation mode
 * of the app, not a fourth separate interface. Read-only by design: no
 * host controls render here under any circumstance, and it never shows
 * anything a host hasn't already revealed to the room (no correct
 * answer or submitted text during the Question phase, no per-player or
 * per-team-member answers ever - not even after Reveal, only the
 * aggregate).
 *
 * Every phase now mirrors the exact same design system the Host/Player
 * pages already share (see TRIVIA_NIGHT_MEMORY.md): the Lobby reuses
 * the Host Dashboard's own two-column shell (`.host-dashboard`) and
 * `GameSummaryCard` verbatim, and Leaderboard/Ended reuses
 * `LeaderboardScreen` verbatim (the same component Host and Player
 * render, `footer` omitted entirely here - the Stage has nothing to
 * moderate and no single competitor of its own to highlight). Question
 * and Reveal follow the Host's own header hierarchy (eyebrow → category
 * → timer → prompt → answers) but are NOT built from the shared
 * `.live-game-*` classes - those are sized for a Host/Player screen
 * viewed at arm's length, not a room-filling display read from across
 * the room, so this page has its own, deliberately larger typography
 * scale (`.stage-*` classes, StagePage.css) built from the same design
 * tokens (spacing/radius/color variables) rather than the same fixed
 * rem sizes. Every screen is fixed-height and non-scrolling (see
 * StagePage.css) - the Stage is a presentation display, not a
 * workspace with a "the page can scroll if it must" fallback the way
 * the Host Dashboard allows itself.
 */
function StagePage() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const { connectionStatus, loading, roomNotFound, room, players, answers, teams, teamAnswers, questionList } =
    useGameRoom({
      roomCode,
      self: null,
    });

  // Called unconditionally, before the early returns below, per the
  // Rules of Hooks - `room` may still be null this early.
  const remainingSeconds = useCountdown(
    room?.timerStatus ?? "not_started",
    room?.timerStartedAt ?? null,
    room?.timerRemainingSeconds ?? null,
  );

  if (connectionStatus === "unconfigured") {
    return (
      <div className="stage">
        <p className="stage-status" role="status">
          Not connected — see the setup notice above
        </p>
      </div>
    );
  }

  if (loading) {
    return <LoadingScreen message="Loading stage..." />;
  }

  if (roomNotFound || !room) {
    return (
      <div className="stage">
        <h1>We couldn&rsquo;t find that room</h1>
        <p className="stage-status">Double-check the room code with your host.</p>
        <Link to="/" className="btn btn-ghost">
          Back to home
        </Link>
      </div>
    );
  }

  const question = getQuestionById(questionList, room.currentQuestionId);
  const sectionInfo =
    room.deckSnapshot?.kind === "game_plan" ? findSectionForQuestion(room.deckSnapshot, room.currentQuestionId) : null;
  const questionNumber = questionList.findIndex((q) => q.id === room.currentQuestionId) + 1;
  const totalQuestions = questionList.length;
  const questionTimerSeconds = room.deckSnapshot?.questionTimerSeconds ?? null;
  const isTeamMode = room.competitionStyle === "team";
  const scorablePlayers = players.filter((player) => !player.isHost);
  const competitors: Competitor[] = isTeamMode
    ? teams.map(teamToCompetitor)
    : scorablePlayers.map(playerToCompetitor);
  const joinUrl = buildJoinUrl(window.location.origin, roomCode);

  return (
    <div className="stage">
      {room.phase === "lobby" && (
        <StageLobbyPhase
          roomCode={roomCode}
          joinUrl={joinUrl}
          connectionStatus={connectionStatus}
          scorablePlayers={scorablePlayers}
          teams={teams}
          deckSnapshot={room.deckSnapshot}
          competitionStyle={room.competitionStyle}
        />
      )}

      {(room.phase === "question" || room.phase === "reveal") && question && (
        <StageQuestionPhase
          question={question}
          sectionInfo={sectionInfo}
          questionNumber={questionNumber}
          totalQuestions={totalQuestions}
          revealed={room.phase === "reveal"}
          questionTimerSeconds={questionTimerSeconds}
          timerStatus={room.timerStatus}
          remainingSeconds={remainingSeconds}
          revealAnswers={isTeamMode ? teamAnswers : answers}
        />
      )}

      {(room.phase === "question" || room.phase === "reveal") && !question && (
        <p className="stage-status" role="status">
          Catching up…
        </p>
      )}

      {(room.phase === "leaderboard" || room.phase === "ended") && (
        <LeaderboardScreen
          ended={room.phase === "ended"}
          competitors={competitors}
          unitLabel={isTeamMode ? "team" : "player"}
          totalQuestions={totalQuestions}
          winnerIds={room.winnerIds}
          footer={null}
        />
      )}
    </div>
  );
}

/**
 * The Stage's own Host Dashboard, from the audience - the exact same
 * two-column shell (`.host-dashboard`, `styles/hostDashboardShell.css`)
 * the Host Lobby/Game Setup and the Player Lobby already share, not a
 * bespoke Stage-only layout. Left panel (`StageRoomPanel`) is the
 * "how do I join" card (QR/room code/live status), reusing the exact
 * `.host-dashboard-sidebar` shape `HostRoomPanel`/`PlayerInfoPanel`
 * already use; right panel is a `.host-dashboard-panel card` with the
 * same eyebrow/heading header, a "Players Joined" roster section
 * (`.host-room-status-roster`, truncated via the same `useRosterLimit`
 * the Host's own Invite Lobby roster uses - "only show a few, never the
 * entire list"), then the exact shared `GameSummaryCard`. One screen
 * for the whole `lobby` phase (both `lobbyStage` "invite" and "setup" -
 * the audience has no equivalent distinction to make, same reasoning as
 * the Player Lobby's own doc comment).
 */
function StageLobbyPhase({
  roomCode,
  joinUrl,
  connectionStatus,
  scorablePlayers,
  teams,
  deckSnapshot,
  competitionStyle,
}: {
  roomCode: string;
  joinUrl: string;
  connectionStatus: string;
  scorablePlayers: PlayerRecord[];
  teams: TeamRecord[];
  deckSnapshot: RoomDeckSnapshot | null;
  competitionStyle: CompetitionStyle;
}) {
  const summary = summarizeDeckSnapshotForSummaryCard(deckSnapshot);
  const rosterLimit = useRosterLimit();
  const isTeamMode = competitionStyle === "team";
  const visiblePlayers = scorablePlayers.slice(0, rosterLimit);
  const hiddenCount = scorablePlayers.length - visiblePlayers.length;

  return (
    <div className="host-dashboard stage-lobby-dashboard">
      <StageRoomPanel roomCode={roomCode} joinUrl={joinUrl} connectionStatus={connectionStatus} />

      <div className="host-dashboard-main">
        <div className="host-dashboard-panel card">
          <div className="host-dashboard-content">
            <div className="host-dashboard-header">
              <div>
                <p className="host-dashboard-eyebrow">Stage Lobby</p>
                <h2>Waiting for Players</h2>
              </div>
            </div>

            <section className="host-dashboard-section">
              <h3>Players Joined</h3>
              <p className="host-room-status-count" role="status">
                {isTeamMode
                  ? `${teams.length} Team${teams.length === 1 ? "" : "s"} Joined`
                  : `${scorablePlayers.length} Player${scorablePlayers.length === 1 ? "" : "s"} Joined`}
              </p>
              {scorablePlayers.length === 0 ? (
                <p className="host-dashboard-section-helper">Waiting for players to join…</p>
              ) : (
                <ul className="host-room-status-roster">
                  {visiblePlayers.map((player) => (
                    <li key={player.clientId}>
                      <span aria-hidden="true">{avatarForClientId(player.clientId)}</span> {player.displayName}
                    </li>
                  ))}
                  {hiddenCount > 0 && <li className="host-roster-more">+{hiddenCount} more</li>}
                </ul>
              )}
            </section>

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

/**
 * The left panel - permanent "how do I join" info, the same
 * `.host-dashboard-sidebar` shape `HostRoomPanel`/`PlayerInfoPanel`
 * already use (fixed, centred, ≥860px). A larger QR than either of
 * those (`.stage-sidebar-qr`, layered on top of the shared `.invite-qr`
 * base rule) - this is read from across a room, not at arm's length,
 * so the Host Dashboard's own compact 100px sidebar QR would be too
 * small here; everything else about the shape is unchanged. */
function StageRoomPanel({
  roomCode,
  joinUrl,
  connectionStatus,
}: {
  roomCode: string;
  joinUrl: string;
  connectionStatus: string;
}) {
  return (
    <aside className="host-dashboard-sidebar card">
      <div className="host-dashboard-sidebar-identity">
        <div className="invite-qr stage-sidebar-qr">
          <RoomQrCode joinUrl={joinUrl} size={190} />
        </div>
        <p className="host-lobby-code">
          Room Code: <strong>{roomCode}</strong>
        </p>
        <p className="host-sidebar-live" role="status">
          <span className="host-sidebar-live-dot" aria-hidden="true" />
          {connectionStatus === "connected" ? "Live" : "Connecting…"}
        </p>
        <p className="stage-scan-hint">Scan to join the game</p>
      </div>
    </aside>
  );
}

/**
 * Question + Reveal, one screen (same "two states, one component"
 * pattern as every other phase pair in this app - see
 * TRIVIA_NIGHT_MEMORY.md). Header hierarchy deliberately mirrors the
 * Host's own Live Game header exactly (eyebrow "Question X of Y" →
 * category → timer), just at Stage scale - see this file's own doc
 * comment for why that's a scaled-up parallel implementation rather
 * than the shared `.live-game-*` classes themselves. Pre-Reveal, the
 * four options render plainly (no host-only correct-answer
 * foreknowledge - the Stage never shows that early); post-Reveal the
 * correct option becomes the visual hero (large, centred, glowing) and
 * a single aggregate stat line replaces the options grid entirely -
 * the audience never needs to compare four answers once one of them
 * has already won.
 */
function StageQuestionPhase({
  question,
  sectionInfo,
  questionNumber,
  totalQuestions,
  revealed,
  questionTimerSeconds,
  timerStatus,
  remainingSeconds,
  revealAnswers,
}: {
  question: Question;
  sectionInfo: StageSectionInfo | null;
  questionNumber: number;
  totalQuestions: number;
  revealed: boolean;
  questionTimerSeconds: number | null;
  timerStatus: TimerStatus;
  remainingSeconds: number | null;
  revealAnswers: GradedLike[];
}) {
  const hasTimer = questionTimerSeconds !== null;
  const categoryLabel = sectionInfo ? sectionInfo.section.deckTitle : "Quick Play";
  const correctAnswerText =
    question.answerMethod === "multiple_choice"
      ? question.options.find((option) => option.id === question.correctOptionId)?.text
      : question.correctAnswer;

  return (
    <div className="stage-question">
      <header className="stage-question-header">
        <div>
          <p className="stage-eyebrow">
            Question {questionNumber} of {totalQuestions}
          </p>
          <p className="stage-category">{categoryLabel}</p>
        </div>
        {!revealed && hasTimer && remainingSeconds !== null && (
          <p className={`stage-timer${remainingSeconds <= 10 ? " is-urgent" : ""}`} role="status">
            <span aria-hidden="true">⏱</span>
            {timerStatus === "expired" ? "0:00" : formatCountdown(remainingSeconds)}
          </p>
        )}
      </header>

      {!revealed ? (
        <>
          <h1 className="stage-question-prompt">{question.prompt}</h1>
          {question.answerMethod === "multiple_choice" && (
            <div className="stage-options">
              {question.options.map((option, index) => (
                <div key={option.id} className="stage-option">
                  <span className="stage-option-letter">{String.fromCharCode(65 + index)}</span>
                  <span>{option.text}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <StageRevealHero correctAnswerText={correctAnswerText} answers={revealAnswers} />
      )}
    </div>
  );
}

/**
 * The Reveal moment - the correct answer itself is the hero (large,
 * centred, one glow-in animation on mount - see `stage-reveal-in` in
 * StagePage.css, which respects `prefers-reduced-motion`), with a
 * single aggregate stat underneath. Never anything more granular than
 * the aggregate (see StagePage's own doc comment) - no names, no
 * per-competitor breakdown, exactly what `computeAggregateReveal`
 * already limits every Stage reveal to today, just presented as the
 * screen's main event instead of a small caption line.
 */
function StageRevealHero({ correctAnswerText, answers }: { correctAnswerText: string | undefined; answers: GradedLike[] }) {
  const aggregate = computeAggregateReveal(answers);

  const statLine = (() => {
    if (aggregate.answeredCount === 0) return "Nobody answered this one";
    if (aggregate.correctCount + aggregate.incorrectCount === 0) return "Answers are still being checked";
    return `${aggregate.percentageCorrect}% answered correctly`;
  })();

  return (
    <div className="stage-reveal-hero">
      <p className="stage-reveal-label">
        <span aria-hidden="true">✓</span> Correct Answer
      </p>
      <p className="stage-reveal-answer">{correctAnswerText}</p>
      <p className="stage-reveal-stat" role="status">
        {statLine}
        {aggregate.pendingCount > 0 && aggregate.answeredCount > 0 && (
          <span className="stage-reveal-pending"> · {aggregate.pendingCount} still being checked</span>
        )}
      </p>
    </div>
  );
}

export default StagePage;
