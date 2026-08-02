-- Trivia Night — Milestone 2 game-state schema
--
-- Why this exists: Milestone 1 used only Supabase Realtime Presence and
-- Broadcast, with no database table. That works for "who is currently
-- connected" (Presence), but Broadcast messages are never replayed to a
-- client that reconnects or refreshes - so a host or player refreshing
-- mid-question had no way to recover the room's true current phase,
-- answers, or scores. Milestone 2 requires exactly that (refresh
-- recovery, non-client-trusted scoring, surviving a full page reload),
-- which needs a persisted, queryable source of truth. Presence stays
-- exactly as it was for the live lobby list; these tables are additive,
-- not a replacement.
--
-- Safe to run more than once - every statement is idempotent.

create extension if not exists pgcrypto;

-- One authoritative row per room: the current phase, which question is
-- active, and a game_instance_id that changes every "Play Again" so
-- answers from a previous game can never be mistaken for the current one.
create table if not exists public.rooms (
  room_code text primary key,
  phase text not null default 'lobby',
  current_question_id text,
  game_instance_id uuid not null default gen_random_uuid(),
  winner_client_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Durable roster + running score, keyed by the same stable client_id
-- used for Presence in Milestone 1. Deliberately separate from Presence:
-- Presence answers "who is online right now"; this answers "who has
-- joined this room and what's their score", which must survive a brief
-- disconnect or a full refresh.
create table if not exists public.room_players (
  room_code text not null references public.rooms (room_code) on delete cascade,
  client_id text not null,
  display_name text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  score integer not null default 0,
  primary key (room_code, client_id)
);

-- One row per player per game instance. Re-answering before Reveal is an
-- upsert on the same primary key - never a duplicate row, and no
-- read-modify-write race between two different players answering at the
-- same time.
create table if not exists public.room_answers (
  room_code text not null references public.rooms (room_code) on delete cascade,
  game_instance_id uuid not null,
  client_id text not null,
  option_id text not null,
  answered_at timestamptz not null default now(),
  primary key (room_code, game_instance_id, client_id)
);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_answers enable row level security;

-- Intentionally permissive: the product has no accounts yet (see the
-- approved Identity Model), and this is a party-game prototype with no
-- sensitive data - just room codes and scores. Anyone holding the anon
-- key can read/write these three tables. This is a known, temporary
-- posture, not an oversight - see "Known limitations" in the milestone
-- report for what a real auth model would change here.
drop policy if exists "anon full access" on public.rooms;
create policy "anon full access" on public.rooms for all using (true) with check (true);

drop policy if exists "anon full access" on public.room_players;
create policy "anon full access" on public.room_players for all using (true) with check (true);

drop policy if exists "anon full access" on public.room_answers;
create policy "anon full access" on public.room_answers for all using (true) with check (true);

-- Add each table to the realtime publication only if it isn't already
-- there, so this script can be re-run safely.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_players'
  ) then
    alter publication supabase_realtime add table public.room_players;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_answers'
  ) then
    alter publication supabase_realtime add table public.room_answers;
  end if;
end $$;
