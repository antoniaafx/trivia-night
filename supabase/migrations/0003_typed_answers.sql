-- Trivia Night — Milestone 4: Typed Answer questions
--
-- Extends the Milestone 2/3 schema (0001_game_state.sql,
-- 0002_team_mode.sql) without touching them. Every statement below is
-- idempotent - safe to run more than once.
--
-- DESIGN NOTE #1 — one answer table per competitor type, not per answer
-- method:
-- A game instance now has more than one question, but any given
-- question is still exactly one answer method (Multiple Choice OR
-- Typed Answer, never both). Rather than a third parallel table for
-- Typed Answer, room_answers/room_team_answers grow a few nullable
-- columns: option_id stays as-is for Multiple Choice, text_answer is
-- new for Typed Answer, and a check constraint enforces that exactly
-- one of the two is ever set per row. This is the same reasoning
-- 0002 used to justify room_team_answers as a parallel-but-not-unified
-- table: the smallest change that cannot regress the already-verified
-- Multiple Choice path.
--
-- DESIGN NOTE #2 — why question_id must be added to the primary key:
-- Both tables were built for Milestone 2/3, where a game instance ever
-- had exactly one question - so (room_code, game_instance_id,
-- client_id) was a sufficient primary key. Milestone 4 introduces a
-- second question in the same game instance. Without a question_id,
-- Question 2's answer would upsert directly on top of Question 1's row
-- for the same competitor, silently destroying it. This is a genuine
-- schema gap, not a style choice, and is fixed here before any
-- question-progression application code is written.
--
-- DESIGN NOTE #3 — where grading and scoring authority lives:
-- There is no separate backend in this architecture; "the
-- repository/server-backed state model" (per the product requirement
-- that clients never decide their own correctness or points) means the
-- existing gameRoomRepository.ts reveal-time logic, exactly as it
-- already works for Multiple Choice today. Normalization and fuzzy
-- matching are pure TypeScript, computed once by that layer at Reveal
-- (or at Host Accept/Reject) and written to grading_status/
-- points_awarded here - every client then only ever *reads* graded
-- state over realtime, never computes its own. No unaccent/fuzzy
-- matching logic is implemented in SQL; this migration only adds the
-- columns that authoritative result gets written into.
--
-- DESIGN NOTE #4 — score reconciliation via points_awarded, not
-- increment-in-place:
-- room_players.score / room_teams.score become the *sum* of
-- points_awarded across every answer row for the current game
-- instance, recomputed (not incremented) on every relevant grading
-- event. Recomputing a sum is naturally idempotent - reviewing the same
-- answer twice, or flipping Accept to Reject, can never double-count -
-- which a running "score = score + delta" update cannot guarantee
-- without extra bookkeeping. This is also what makes scores accumulate
-- correctly across two questions instead of the latest question
-- overwriting the running total.

-- 1. room_answers (Solo Mode) -------------------------------------------

-- 1a. question_id: added and backfilled to the one question that has
--     ever existed so far, so no existing test/dev rows are lost.
alter table public.room_answers
  add column if not exists question_id text not null default 'q1';

-- 1b. Primary key must include question_id from here on. Detected by
--     checking whether the current room_answers_pkey constraint already
--     covers question_id - if it does, this block is a no-op.
do $$
begin
  if not exists (
    select 1
    from information_schema.key_column_usage
    where table_schema = 'public'
      and table_name = 'room_answers'
      and constraint_name = 'room_answers_pkey'
      and column_name = 'question_id'
  ) then
    alter table public.room_answers drop constraint room_answers_pkey;
    alter table public.room_answers
      add constraint room_answers_pkey
      primary key (room_code, game_instance_id, question_id, client_id);
  end if;
end $$;

-- 1c. option_id is no longer required on every row - a Typed Answer row
--     has text_answer instead.
alter table public.room_answers alter column option_id drop not null;

-- 1d. The original submitted text, preserved verbatim for Host review -
--     never overwritten by normalization.
alter table public.room_answers add column if not exists text_answer text;

-- 1e. Grading state. Multiple Choice may leave this at 'ungraded'
--     (it continues to grade directly into score at Reveal, unchanged);
--     Typed Answer moves through these deliberately.
alter table public.room_answers
  add column if not exists grading_status text not null default 'ungraded';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'room_answers_grading_status_check'
  ) then
    alter table public.room_answers
      add constraint room_answers_grading_status_check
      check (grading_status in ('ungraded', 'correct', 'incorrect', 'pending_review'));
  end if;
end $$;

-- 1f. Points this specific answer contributed - the unit score gets
--     summed from, per competitor per game instance (see Design Note #4).
alter table public.room_answers
  add column if not exists points_awarded integer not null default 0;

-- 1g. When the Host resolved a pending_review answer, if ever. The
--     outcome itself lives in grading_status (correct/incorrect) rather
--     than a second column, so there is exactly one place that can say
--     what the review decided.
alter table public.room_answers add column if not exists reviewed_at timestamptz;

-- 1h. Exactly one answer shape per row, and never a blank/whitespace
--     typed answer (submission is validated client-side too, but this
--     is the floor no client bug can get under).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'room_answers_answer_shape_check'
  ) then
    alter table public.room_answers
      add constraint room_answers_answer_shape_check
      check (
        (option_id is not null and text_answer is null)
        or (option_id is null and text_answer is not null and btrim(text_answer) <> '')
      );
  end if;
end $$;

-- 1i. The Host review queue only ever needs "pending rows for this
--     room+instance+question" - a partial index keeps that cheap
--     without indexing every already-graded row.
create index if not exists room_answers_pending_review_idx
  on public.room_answers (room_code, game_instance_id, question_id)
  where grading_status = 'pending_review';

-- 2. room_team_answers (Team Mode) - identical shape and reasoning ------

alter table public.room_team_answers
  add column if not exists question_id text not null default 'q1';

do $$
begin
  if not exists (
    select 1
    from information_schema.key_column_usage
    where table_schema = 'public'
      and table_name = 'room_team_answers'
      and constraint_name = 'room_team_answers_pkey'
      and column_name = 'question_id'
  ) then
    alter table public.room_team_answers drop constraint room_team_answers_pkey;
    alter table public.room_team_answers
      add constraint room_team_answers_pkey
      primary key (room_code, game_instance_id, question_id, team_id);
  end if;
end $$;

alter table public.room_team_answers alter column option_id drop not null;

alter table public.room_team_answers add column if not exists text_answer text;

alter table public.room_team_answers
  add column if not exists grading_status text not null default 'ungraded';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'room_team_answers_grading_status_check'
  ) then
    alter table public.room_team_answers
      add constraint room_team_answers_grading_status_check
      check (grading_status in ('ungraded', 'correct', 'incorrect', 'pending_review'));
  end if;
end $$;

alter table public.room_team_answers
  add column if not exists points_awarded integer not null default 0;

alter table public.room_team_answers add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'room_team_answers_answer_shape_check'
  ) then
    alter table public.room_team_answers
      add constraint room_team_answers_answer_shape_check
      check (
        (option_id is not null and text_answer is null)
        or (option_id is null and text_answer is not null and btrim(text_answer) <> '')
      );
  end if;
end $$;

create index if not exists room_team_answers_pending_review_idx
  on public.room_team_answers (room_code, game_instance_id, question_id)
  where grading_status = 'pending_review';

-- No RLS or realtime-publication changes are needed: both tables
-- already carry the permissive "anon full access" policy from
-- 0001/0002 (row-level, so it already covers these new columns), and
-- both are already in the supabase_realtime publication - adding
-- columns to an already-published table requires no further action.
