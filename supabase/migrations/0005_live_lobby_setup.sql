-- Trivia Night — Milestone 5 revision: live Lobby setup
--
-- Extends the Milestone 2-5 schema (0001-0004) without touching any of
-- those files. Every statement below is idempotent - safe to run more
-- than once.
--
-- WHY THIS MIGRATION EXISTS
-- The Creator MVP's hosting flow changed from "finish setup, then
-- create the room" to "create the room immediately, then configure the
-- game live in the Lobby while Players are already joining." That
-- directly conflicts with 0002_team_mode.sql's competition-style lock,
-- which was written for the OLD rule ("locked once any non-host player
-- has joined"). The new rule is "editable throughout Lobby, locked the
-- moment Start Game succeeds" - i.e. keyed off `phase`, not off whether
-- anyone has joined yet. 0002 is already applied and is not edited;
-- this migration replaces only the trigger FUNCTION's body (same
-- function and trigger names, kept for continuity - Postgres has no
-- concept of "which migration file defined this," so redefining a
-- function from an earlier migration in a later one is the same
-- pattern 0002 itself already used against 0001's tables).
--
-- NO NEW COLUMNS ARE NEEDED. rooms.deck_snapshot (0004) is a single
-- unconstrained jsonb column - it already supports growing from a
-- provisional `kind: "planned_game"` shape (written repeatedly while
-- the Host adjusts setup during Lobby) into the frozen `kind:
-- "game_plan"` shape at Start Game, exactly as it already supported
-- the single-Deck `kind: "setup"` shape it briefly held before this
-- revision. Only the application-layer TypeScript shape changes (see
-- src/utils/gamePlan.ts) - there is no schema reason to add a column
-- for this.
--
-- NO NEW RPC IS INTRODUCED FOR START GAME. The existing pattern this
-- project has used since Milestone 2 - resolve everything the write
-- needs to know first (fetch latest Decks, validate readiness, check
-- Team membership, compute the plan), then make exactly one atomic
-- `update rooms set phase=..., deck_snapshot=..., current_question_id=...
-- where phase='lobby'` - already gives single-transaction atomicity for
-- the write itself, and this is a single-Host, low-frequency action
-- with no concurrent writers, the same trade-off already accepted and
-- documented for resetRoomForNewGame (Play Again) and revealAndScore.
-- Nothing about a live Lobby changes that reasoning, so no RPC is
-- added here. If real-world use ever reveals a genuine race, that is a
-- clean, isolated addition for a future migration.

create or replace function public.prevent_competition_style_change_after_join()
returns trigger as $$
begin
  if new.competition_style is distinct from old.competition_style then
    if old.phase <> 'lobby' then
      raise exception 'competition_style is locked once the game has started';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

-- Re-asserted for a fresh database, though 0002 already created this
-- trigger and it still points at the function above by name - this is
-- a no-op on a database where 0002 has already run.
drop trigger if exists trg_lock_competition_style on public.rooms;
create trigger trg_lock_competition_style
  before update on public.rooms
  for each row
  execute function public.prevent_competition_style_change_after_join();
