-- Trivia Night — Host Lobby restructure: Invite / Setup / Ready stages
--
-- WHY THIS MIGRATION EXISTS
-- The Host flow is being split into three explicit stages within the
-- existing lobby phase: Invite Lobby (just getting people connected),
-- Game Setup (configuring Decks/duration/competition style/host
-- participation), and Ready Lobby (final locked checkpoint before Start
-- Game). This stage is tracked entirely at the application layer, inside
-- the existing rooms.deck_snapshot jsonb column, via a new `status` field
-- on the `planned_game` shape ("invite" | "setup" | "ready") - see
-- src/utils/gamePlan.ts. NO NEW COLUMN IS NEEDED for this; deck_snapshot
-- is already an unconstrained jsonb column that has grown its shape twice
-- before (0004, 0005) without a schema change.
--
-- THE ONE GENUINE SCHEMA-RELEVANT CHANGE
-- Competition style must now lock when the Host confirms Game Setup
-- (deck_snapshot.status becomes 'ready'), not merely once the room leaves
-- the lobby phase. Migration 0005's trigger function only ever checked
-- `old.phase`; Confirm Setup happens entirely within phase = 'lobby', so
-- that check alone can no longer express the new rule. 0005 is not
-- edited - this migration replaces only the trigger FUNCTION's body
-- (same function name, same trigger, same table - the exact pattern 0005
-- already used against 0002's function, and 0002 against 0001's tables).
-- Since the trigger itself (name/table/timing) is unchanged, only
-- `create or replace function` is needed - no drop/create of the trigger.
--
-- BACKWARD COMPATIBILITY
-- Existing rows - including rows with deck_snapshot = null (legacy Quick
-- Play), or a planned_game object with no `status` field written before
-- this change - are read with `coalesce(..., 'invite')`, so an old/legacy
-- row is never accidentally treated as locked. A rematch's frozen
-- `kind: "game_plan"` snapshot (present while phase is still 'lobby') is
-- also treated as locked, matching its existing read-only behaviour.

create or replace function public.prevent_competition_style_change_after_join()
returns trigger as $$
begin
  if new.competition_style is distinct from old.competition_style then
    if old.phase <> 'lobby'
       or (old.deck_snapshot ->> 'kind') = 'game_plan'
       or coalesce(old.deck_snapshot ->> 'status', 'invite') = 'ready'
    then
      raise exception 'competition_style is locked once Game Setup is confirmed';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
