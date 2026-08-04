-- Trivia Night — revert competition-style lock to "locks at Start Game"
--
-- WHY THIS MIGRATION EXISTS
-- The Host flow has been clarified: there is no separate Ready Lobby
-- stage after all. The pre-game flow is just Invite -> Game Setup ->
-- Start Game, with configuration (including competition style) staying
-- fully editable through both Invite and Game Setup, locking only the
-- moment Start Game actually succeeds. This is a deliberate correction
-- of migration 0006, which locked at a "Confirm Setup" checkpoint that
-- no longer exists in the product. 0006 is not edited - this migration
-- replaces only the trigger FUNCTION's body again (same function name,
-- same trigger, same table - the same pattern 0006 used against 0005's
-- function, 0005 against 0002's, and 0002 against 0001's).
--
-- NET EFFECT
-- This restores the exact trigger body from migration 0005 (before
-- 0006's `deck_snapshot`-based check was added): the only thing that
-- blocks a competition_style change is `phase <> 'lobby'`. Since
-- `deck_snapshot.status` no longer distinguishes "confirmed" from
-- "still configuring" for locking purposes (there's no confirmation
-- step to distinguish), the extra check in 0006 no longer applies to
-- anything meaningful and is removed for clarity, not just left dead.
--
-- BACKWARD COMPATIBILITY
-- No data is touched. A rematch's frozen `kind: "game_plan"` snapshot
-- while phase is still 'lobby' remains effectively locked in practice
-- because the application layer never renders an editable competition
-- style control for a rematch - not because the trigger singles it
-- out, exactly as it worked before migration 0006 existed.

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
