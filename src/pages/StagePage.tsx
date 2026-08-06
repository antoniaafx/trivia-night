import { Link, useParams } from "react-router-dom";
import { useGameRoom } from "../hooks/useGameRoom";
import { useCountdown } from "../hooks/useCountdown";
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
import type { CompetitionStyle, Competitor, TimerStatus } from "../types/game";
import type { PlayerRecord } from "../types/game";
import { playerToCompetitor, teamToCompetitor } from "../types/game";
import "../styles/hostDashboardShell.css";
import "../styles/leaderboardShell.css";
import "./StagePage.css";

// Player names are deliberately never shown here - the Stage is read
// from across a room, where an emoji reads faster than text - so only
// a capped number of avatars (see avatarForClientId, shared with the
// Host Dashboard's Room Status) render before summarizing the rest.
const STAGE_AVATAR_VISIBLE_LIMIT = 24;

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
 * rem sizes.
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
          scorablePlayers={scorablePlayers}
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
 * The Stage's own "Host Dashboard, from the audience" - the same two
 * things the Host Lobby leads with (how to join, what we're about to
 * play), reused verbatim where a shared component exists
 * (`GameSummaryCard`) rather than restating the same facts in new
 * Stage-only prose. One screen for the whole `lobby` phase (both
 * `lobbyStage` "invite" and "setup" - the audience has no equivalent
 * distinction to make, same reasoning as the Player Lobby's own doc
 * comment) instead of the old two-branch invite/setup split.
 */
function StageLobbyPhase({
  roomCode,
  joinUrl,
  scorablePlayers,
  deckSnapshot,
  competitionStyle,
}: {
  roomCode: string;
  joinUrl: string;
  scorablePlayers: PlayerRecord[];
  deckSnapshot: RoomDeckSnapshot | null;
  competitionStyle: CompetitionStyle;
}) {
  const summary = summarizeDeckSnapshotForSummaryCard(deckSnapshot);
  const count = scorablePlayers.length;

  return (
    <div className="stage-lobby">
      <div className="stage-join-card card">
        <p className="stage-title">Trivia Night</p>
        <div className="stage-qr">
          <RoomQrCode joinUrl={joinUrl} size={220} />
        </div>
        <p className="stage-room-code">
          Room <strong>{roomCode}</strong>
        </p>
        <p className="stage-scan-hint">Scan to join the game</p>
      </div>

      {summary && (
        <div className="stage-summary-card card">
          <GameSummaryCard
            planSummary={summary.planSummary}
            competitionStyle={competitionStyle}
            questionTimerSeconds={summary.questionTimerSeconds}
            questionFlow={summary.questionFlow}
            hostParticipation={summary.hostParticipation}
          />
        </div>
      )}

      <div className="stage-lobby-footer">
        {count > 0 && (
          <div className="stage-avatar-row" aria-hidden="true">
            {scorablePlayers.slice(0, STAGE_AVATAR_VISIBLE_LIMIT).map((player) => (
              <span key={player.clientId}>{avatarForClientId(player.clientId)}</span>
            ))}
          </div>
        )}
        <p className="stage-status" role="status">
          {count === 0
            ? "Waiting for players to join…"
            : `${count} Player${count === 1 ? "" : "s"} Joined · Waiting for Host…`}
        </p>
      </div>
    </div>
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
