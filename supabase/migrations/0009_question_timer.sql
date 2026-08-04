-- Trivia Night — Question Timer state columns
--
-- WHY THREE PLAIN COLUMNS, NOT A JSONB FIELD ON deck_snapshot
-- deck_snapshot holds the frozen Game Plan (or, before Start Game, the
-- Host's live planned_game draft) - a large, mostly-static blob that
-- only changes on meaningful setup edits. Timer state is the opposite:
-- it mutates every time the Host starts/pauses/resumes/expires the
-- countdown, once per Question. Piling frequently-changing state onto
-- deck_snapshot would mean rewriting that whole JSONB blob on every
-- timer tick's *write* (not the read - clients already derive the live
-- countdown purely from these three values, never from a server push -
-- see src/utils/timer.ts) and would reintroduce exactly the kind of
-- TOAST/large-column churn migration 0008 exists to avoid. These three
-- columns follow the same pattern `phase`/`current_question_id`
-- already use: small, scalar, cheap to update, never TOASTed.
--
-- THE SERVER-AUTHORITATIVE MODEL
-- timer_started_at is a fixed server timestamp written only when the
-- countdown starts or resumes; timer_remaining_seconds is the baseline
-- to count down from as of that timestamp (or the frozen value while
-- paused, or the full configured duration before the Host has pressed
-- Start Timer). Every client - Host, Player, Stage, a refresh, a late
-- joiner - computes "how much time is left right now" the same way,
-- from the same two values, rather than trusting any decrementing
-- number sent over the wire. See src/utils/timer.ts's
-- computeRemainingSeconds for the single implementation of that math.
--
-- timer_status has no CHECK constraint restricting it to the four
-- application-level values ('not_started' | 'running' | 'paused' |
-- 'expired') - consistent with how `phase` itself is validated only in
-- the application layer (see isPhaseTransitionAllowed), not the
-- database, throughout this project.

alter table public.rooms
  add column if not exists timer_status text not null default 'not_started',
  add column if not exists timer_started_at timestamptz null,
  add column if not exists timer_remaining_seconds integer null;
