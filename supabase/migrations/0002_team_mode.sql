-- Trivia Night — Milestone 3: Team Mode
--
-- Extends the Milestone 2 schema (0001_game_state.sql) without touching
-- it. Every statement below is idempotent - safe to run more than once.
--
-- DESIGN NOTE — why a separate room_team_answers table instead of
-- overloading room_answers with a nullable team_id:
-- Retrofitting a polymorphic "competitor" column into room_answers would
-- mean altering its column nullability and rebuilding its primary key -
-- a real risk to the already-verified, working Solo Mode path from
-- Milestone 2. A new, parallel table with the same shape (one row per
-- competitor per game instance, upserted on the same primary key
-- pattern) is purely additive: Solo Mode's table is never touched, and
-- the "avoid duplicated logic" requirement is met at the application
-- layer instead - a shared Competitor abstraction and shared scoring/
-- leaderboard functions operate on either table's data, so nothing about
-- *how* answers are scored or ranked is duplicated, only the storage
-- shape is parallel rather than unified. This is the smallest change
-- that cannot regress Milestone 2.

-- 1. Competition style lives on the room, defaulting to Team Play (the
--    primary product identity is social, pub-style trivia).
alter table public.rooms
  add column if not exists competition_style text not null default 'team';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rooms_competition_style_check'
  ) then
    alter table public.rooms
      add constraint rooms_competition_style_check
      check (competition_style in ('solo', 'team'));
  end if;
end $$;

-- Rename for honesty: this column already held either a player's
-- client_id or (from this migration on) a team's id. "winner_client_ids"
-- would be actively misleading in Team Mode, so it's renamed once, here,
-- rather than left wrong going forward. No data is lost - this is a
-- metadata-only rename.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rooms' and column_name = 'winner_client_ids'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rooms' and column_name = 'winner_ids'
  ) then
    alter table public.rooms rename column winner_client_ids to winner_ids;
  end if;
end $$;

-- 2. Teams. A team only ever needs an id, which room it belongs to, a
--    name, and when it was created (used as the leaderboard tiebreaker,
--    the same role room_players.joined_at already plays for Solo Mode).
create table if not exists public.room_teams (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.rooms (room_code) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(btrim(name))) stored,
  created_at timestamptz not null default now(),
  score integer not null default 0,
  constraint room_teams_name_length check (char_length(btrim(name)) between 1 and 30)
);

-- Enforces "team names unique within a room using normalized comparison"
-- at the data layer, not just in the join form - a second client racing
-- to create the same name gets a clean, catchable constraint violation
-- instead of two teams silently sharing a name.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'room_teams_room_code_normalized_name_key'
  ) then
    alter table public.room_teams
      add constraint room_teams_room_code_normalized_name_key unique (room_code, normalized_name);
  end if;
end $$;

create index if not exists room_teams_room_code_idx on public.room_teams (room_code);

-- 3. A player belongs to at most one team, by construction - a single
--    nullable column can only ever point at one row. NULL in Solo Mode,
--    and NULL for the host in every mode.
alter table public.room_players
  add column if not exists team_id uuid references public.room_teams (id) on delete set null;

create index if not exists room_players_team_id_idx on public.room_players (team_id);

-- 4. Team answers - identical shape and semantics to room_answers, keyed
--    by team_id instead of client_id. Re-answering before Reveal is an
--    upsert on the same primary key, exactly like Solo Mode; whichever
--    teammate's write commits last is deterministically the team's
--    answer, because Postgres itself serializes concurrent upserts to
--    the same row - no client-side timestamp comparison is involved or
--    needed.
create table if not exists public.room_team_answers (
  room_code text not null references public.rooms (room_code) on delete cascade,
  game_instance_id uuid not null,
  team_id uuid not null references public.room_teams (id) on delete cascade,
  option_id text not null,
  answered_at timestamptz not null default now(),
  primary key (room_code, game_instance_id, team_id)
);

create index if not exists room_team_answers_room_instance_idx
  on public.room_team_answers (room_code, game_instance_id);

-- 5. RLS, matching the existing posture (see 0001's note): no accounts
--    yet, so the anon key can read/write these new tables the same way
--    it already can for rooms/room_players/room_answers. Not a broader
--    weakening - the same already-accepted, documented trade-off,
--    applied consistently to the two new tables.
alter table public.room_teams enable row level security;
alter table public.room_team_answers enable row level security;

drop policy if exists "anon full access" on public.room_teams;
create policy "anon full access" on public.room_teams for all using (true) with check (true);

drop policy if exists "anon full access" on public.room_team_answers;
create policy "anon full access" on public.room_team_answers for all using (true) with check (true);

-- 6. Data-layer enforcement of the competition-style lock. This is the
--    one rule that genuinely cannot be left to the UI alone: RLS here is
--    permissive by design (no accounts), so a trigger is the only
--    mechanism that can guarantee this regardless of which client (or
--    a stray retry, or a bug) attempts the change.
create or replace function public.prevent_competition_style_change_after_join()
returns trigger as $$
begin
  if new.competition_style is distinct from old.competition_style then
    if exists (
      select 1 from public.room_players
      where room_code = old.room_code and is_host = false
    ) then
      raise exception 'competition_style is locked once a player has joined this room';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_lock_competition_style on public.rooms;
create trigger trg_lock_competition_style
  before update on public.rooms
  for each row
  execute function public.prevent_competition_style_change_after_join();

-- 7. Realtime publication, same idempotent pattern as 0001.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_teams'
  ) then
    alter publication supabase_realtime add table public.room_teams;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_team_answers'
  ) then
    alter publication supabase_realtime add table public.room_team_answers;
  end if;
end $$;
