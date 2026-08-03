-- Trivia Night — Milestone 5: Creator MVP
--
-- Extends the Milestone 2/3/4 schema (0001-0003) without touching it.
-- Every statement below is idempotent - safe to run more than once.
--
-- DESIGN NOTE #1 — anonymous creator identity, not accounts:
-- There is no auth system yet (see 0001's note on rooms/players: the
-- product has no accounts, and every existing table is intentionally
-- readable/writable by the anon key). Decks reuse that same accepted
-- posture rather than inventing a fake enforcement mechanism: a
-- creator_id column holds a random id the app generates once and keeps
-- in this browser's localStorage (see src/hooks/useCreatorId.ts,
-- application-layer, not part of this migration). "My Decks only shows
-- mine" is enforced by the client always filtering on that id, exactly
-- like "which room am I in" already works - NOT by RLS, because there
-- is no verifiable identity for RLS to check without real auth. Anyone
-- holding the anon key could, in principle, query every deck directly;
-- this is a known, documented limitation carried over unchanged from
-- the existing rooms/players posture, not a new regression.
--
-- DESIGN NOTE #2 — one deck_questions table, nullable method-specific
-- columns, not JSON payload or child tables:
-- Mirrors the exact reasoning already used for room_answers/
-- room_team_answers in 0003: a single strongly-typed table with
-- Multiple-Choice columns (options, correct_option_id) and Typed-Answer
-- columns (correct_answer, accepted_answers) nullable depending on
-- answer_method, enforced by a check constraint. A generic JSON payload
-- would need runtime shape validation on every read; per-method child
-- tables would need a join and two write paths for one Question. This
-- is the smallest model that stays strongly typed and maps directly
-- onto the existing MultipleChoiceQuestion/TypedAnswerQuestion
-- discriminated union in src/data/questions.ts.
--
-- DESIGN NOTE #3 — fractional (numeric) position, not integer:
-- Duplicate Question must insert immediately after its source without
-- touching every later row. With integer positions that would mean
-- renumbering everything after the insertion point on every duplicate.
-- A numeric position lets a new row slot in at the midpoint between its
-- two neighbours (e.g. 2 and 3 -> 2.5) - insert, duplicate, and Move
-- Up/Down all ever touch at most the row(s) directly involved. The
-- unique constraint on (deck_id, position) is DEFERRABLE INITIALLY
-- DEFERRED so a single multi-row upsert (used for Move Up/Down, which
-- swaps two rows' positions) can never trip a spurious violation
-- mid-statement.
--
-- DESIGN NOTE #4 — deck snapshot lives on rooms, not a copied table:
-- Editing a Deck after a game starts must never change that game.
-- Rather than copying deck_questions into new game-scoped rows, the
-- ordered Question list is captured as JSON directly on the rooms row
-- at Start Game (rooms.deck_snapshot) - the same shape the app already
-- works with in memory (Question[]), so gameplay code needs no new
-- fetch path, only "read from room.deckSnapshot instead of the
-- hardcoded QUESTIONS array when present". A null deck_snapshot means
-- this room is using the existing hardcoded sample Questions (the
-- pre-Creator "Quick Play" path is preserved deliberately, not removed
-- - see the Milestone 5 report for why).

-- 1. Decks ----------------------------------------------------------

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null,
  title text not null default 'Untitled Trivia',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_hosted_at timestamptz
);

create index if not exists decks_creator_id_idx on public.decks (creator_id);

-- 2. Deck Questions ---------------------------------------------------

create table if not exists public.deck_questions (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks (id) on delete cascade,
  position numeric not null,
  answer_method text not null,
  prompt text not null default '',
  points integer not null default 100,

  -- Multiple Choice only.
  options jsonb,
  correct_option_id text,

  -- Typed Answer only.
  correct_answer text,
  accepted_answers jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deck_questions_answer_method_check'
  ) then
    alter table public.deck_questions
      add constraint deck_questions_answer_method_check
      check (answer_method in ('multiple_choice', 'typed_answer'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deck_questions_points_check'
  ) then
    alter table public.deck_questions
      add constraint deck_questions_points_check
      check (points > 0 and points <= 1000);
  end if;
end $$;

-- Exactly one answer method's fields are ever populated per row - the
-- same discriminated-union shape enforced in application code, held to
-- at the data layer too.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deck_questions_shape_check'
  ) then
    alter table public.deck_questions
      add constraint deck_questions_shape_check
      check (
        (answer_method = 'multiple_choice' and correct_answer is null and accepted_answers is null)
        or
        (answer_method = 'typed_answer' and options is null and correct_option_id is null)
      );
  end if;
end $$;

-- Deferrable so a single multi-row write (Move Up/Down swapping two
-- positions) can never trip a spurious violation before the statement
-- finishes - see Design Note #3.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deck_questions_deck_position_key'
  ) then
    alter table public.deck_questions
      add constraint deck_questions_deck_position_key
      unique (deck_id, position) deferrable initially deferred;
  end if;
end $$;

create index if not exists deck_questions_deck_id_position_idx
  on public.deck_questions (deck_id, position);

-- 3. Immutable per-room Deck snapshot, captured at Start Game ---------

alter table public.rooms add column if not exists deck_snapshot jsonb;

-- 4. Atomic Deck duplication -------------------------------------------
--
-- A whole-Deck copy touches two tables (decks, deck_questions) with a
-- foreign-key dependency between them - the one operation in this
-- migration that genuinely needs a single transaction guarantee
-- PostgREST's one-request-per-table-call model can't give it directly.
create or replace function public.duplicate_deck(source_deck_id uuid, new_creator_id text)
returns uuid
language plpgsql
as $$
declare
  new_deck_id uuid;
begin
  insert into public.decks (creator_id, title)
  select new_creator_id, title || ' — Copy'
  from public.decks
  where id = source_deck_id
  returning id into new_deck_id;

  if new_deck_id is null then
    raise exception 'Deck not found';
  end if;

  insert into public.deck_questions (
    deck_id, position, answer_method, prompt, points,
    options, correct_option_id, correct_answer, accepted_answers
  )
  select
    new_deck_id, position, answer_method, prompt, points,
    options, correct_option_id, correct_answer, accepted_answers
  from public.deck_questions
  where deck_id = source_deck_id
  order by position;

  return new_deck_id;
end;
$$;

grant execute on function public.duplicate_deck(uuid, text) to anon;
grant execute on function public.duplicate_deck(uuid, text) to authenticated;

-- 5. RLS - same permissive posture as every existing table (see Design
--    Note #1). Not a broader weakening; the same already-accepted
--    trade-off, applied consistently to the two new tables.
alter table public.decks enable row level security;
alter table public.deck_questions enable row level security;

drop policy if exists "anon full access" on public.decks;
create policy "anon full access" on public.decks for all using (true) with check (true);

drop policy if exists "anon full access" on public.deck_questions;
create policy "anon full access" on public.deck_questions for all using (true) with check (true);

-- No realtime publication entries: the Deck Editor does not need live
-- multi-user collaboration (out of scope for this milestone), so
-- decks/deck_questions are deliberately not added to supabase_realtime.
-- rooms.deck_snapshot needs no publication change either - rooms is
-- already published, and adding a column to an already-published table
-- requires no further action.
