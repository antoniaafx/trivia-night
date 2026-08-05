# Trivia Night — Project Memory

## 1. Project State

- Core Host workspace (Invite Lobby → Game Setup/Dashboard → Live Question → Reveal → Leaderboard → Ended) is functional and has had multiple UX redesign passes.
- Player join flow, Stage (big-screen) view, Deck Library/Editor, and Quick Play are functional and untouched in this session.
- Major completed: unified Host workspace layout system (fixed left room panel + right panel + action footer/bar), Live Game Control Center redesign, Deck Library/Game Setup separation, Question Timer system.
- Known issue (flagged, not fixed): `teamReadinessProblem` (unassigned players in Team mode) has no visible surface after the Start Game footer was stripped to button-only; only shown via the disabled button state itself.
- Current priority: none queued — last task (Live Game Control Center redesign) just completed and verified.

## 2. Architecture

- Single large page component `HostControlPanelPage.tsx` renders all Host-side room phases (`lobby/invite`, `lobby/setup`, `question`, `reveal`, `leaderboard`, `ended`) via conditional blocks keyed on `room.phase`/`lobbyStage`.
- Realtime data split: `useRoomChannel` (Presence, ephemeral "who's online") vs `useGameRoom` (Postgres-backed authoritative state: room, players, teams, answers).
- Shared Host workspace shell (CSS): `.host-dashboard` (grid: fixed sidebar + main), `.host-dashboard-sidebar` (the fixed left room panel, `position:fixed` ≥860px, `position:static` stacked <860px), `.host-dashboard-panel`/`.host-dashboard-content` (right panel shape owner + padded body), `.host-dashboard-start-bar` (action footer).
- `--app-header-height` (68px, `variables.css`) is the single source of truth every sticky/fixed Host element offsets from.
- `scrollbar-gutter: stable` on `html` (global.css) — prevents the fixed sidebar shifting a few px between short and tall Host pages (scrollbar-presence mismatch).
- Live Game screen (`QuestionPhase`) is a separate three-region CSS Grid system (`.live-game`, `grid-template-areas`), independent of the sidebar+panel dashboard shell, sized to fill the viewport below the navbar with no page scroll.
- Breakpoint convention: 860px is the ONE Host-workspace breakpoint (sidebar fixed↔static, dashboard two-col↔stacked, live-game two-col↔stacked). Do not introduce competing breakpoints.

## 3. UI / UX Decisions (approved, final)

- Host Dashboard/Invite Lobby: fixed left room panel (QR, Room Code, Live status, Open Stage, optional Back to Invite) never moves/resizes across screens; right panel scrolls independently.
- Sidebar vertical rhythm: 3 regions (Back-to-Invite / QR+Code+Live cluster / Open Stage) with `gap: var(--space-lg)` minimum + `margin-block:auto` on the middle cluster to absorb extra height — not evenly distributed, not stretched.
- All Host action footers (Start Game, Continue, Live Game's Reveal Answer) share one visual identity: navbar-matching translucent background (`rgba(18,14,41,.45)` + `blur(16px)`, `.88` opaque fallback), same elevation.
- Start Game/Continue footers: **dynamic corner state** — square while sticky mid-scroll, rounded (`var(--radius-lg)`) once the footer reaches its true resting position, via `useStickyFooterAtRest` (IntersectionObserver on a sentinel, not scroll polling). No CSS transition on the radius swap (was found to hang if frames aren't actively composited — instant snap instead).
- Footers show **only the primary action button** — no redundant summary text, no "Ready" copy. A genuine action-failure message (`startError`) is shown as a conditional alert above the footer, not inside it.
- Host Invite Lobby right panel reuses the exact Host Dashboard shell (`HostRoomPanel` shared component), header "HOST LOBBY / Waiting for Players", body = "Players Joining" (live count + avatar+name roster, correct singular/plural grammar, "+N more" truncation).
- Deck cards: portrait `aspect-ratio: 3/4` (final, after reversals), identical filled/empty dimensions.
- Live Game Control Center: 3-section layout (header / two-column body / action footer), fills viewport, no scroll on desktop. 30%/70% column split (Player Monitor / Question Panel). DOM order = header → question → footer → monitor (matches "Information Hierarchy" spec and keeps tab order sane); CSS `grid-template-areas` reorders visually per breakpoint, not DOM.
- Player Monitor replaces old aggregate "4/5 answered" counter with named Answered/Waiting rosters (✓/⏳ icon + text, never color alone); "✓ Everyone has answered" replaces an empty Waiting section. New Answered rows get a one-time fade+slide-in (`prefers-reduced-motion` respected).
- Timer control (Start/Pause/Resume) lives under the Player Monitor, not the footer — it's about player progress, not question navigation.
- Timer readout in the header is large (2.75rem), bold, with a purely-supplementary `.is-urgent` color accent at ≤10s (never the sole signal).
- Answer options render as cards (letter badge + text), correct answer host-only-highlighted with a "Correct" tag — same info as the old "(correct)" suffix, restyled.
- Standalone QR fallback card is suppressed specifically during `room.phase === "question"` (Live Game Control Center has no room for it); still shown unchanged on `reveal`/`leaderboard`/`ended`.
- Mobile-first throughout: Host Dashboard/Lobby footers become full-width buttons <860px; Live Game stacks to single column, auto height (page may scroll only if genuinely necessary — question prioritized over player monitor).

## 4. Components

- `HostRoomPanel` — the shared fixed left room panel (QR/Room Code/Live status/Open Stage, optional Back to Invite), used by both `GameSetupPhase` and `InviteLobbyPhase`.
- `InviteLobbyPhase` — replaces old `InviteLobbyCard`; reuses the full Dashboard shell.
- `GameSetupPhase` / `RoomStatusSection` / `GameSummaryCard` / `SelectedDecksPanel` (deck-card grid) / `DeckPicker` — Host Dashboard right panel.
- `QuestionPhase` — the redesigned Live Game Control Center.
- `useStickyFooterAtRest` — shared hook (IntersectionObserver + sentinel) driving dynamic footer corner state.
- `useRosterLimit` — viewport-based roster truncation limit (3/4/6 by breakpoint).
- `avatarForClientId` (`utils/avatars.ts`) — stable hash → emoji, shared across Room Status, Invite Lobby roster, Player Monitor.
- `RoomQrCode`, `LoadingScreen`, `CompetitorLeaderboard` — unchanged shared components.

## 5. Current Screens

**Host Invite Lobby** — fixed left panel (no Back to Invite) + right panel ("HOST LOBBY / Waiting for Players", Players Joining count+roster) + Continue footer (label: "Continue without players" / "Continue").

**Host Dashboard (Game Setup)** — fixed left panel (with Back to Invite) + right panel (Room Status, Competition, Decks, Question Timer, Question Flow, Host Participation, Game Summary) + Start Game footer.

**Live Game Control Center (`question` phase)** — header (question X of Y, category, large timer) / two-column body (Player Monitor left 30%, Question Panel right 70%) / Reveal Answer footer. No page scroll on desktop.

**Reveal / Leaderboard / Ended phases** — unchanged, original simple centered-card layout (`.host-phase`), out of scope for the redesign passes so far.

**Stage / Player screens** — unchanged this session.

## 6. Data Model (fields future work depends on)

- `RoomRecord`: `phase` (`lobby|question|reveal|leaderboard|ended`), `competitionStyle` (`solo|team`), `timerStatus` (`not_started|running|paused|expired`), `deckSnapshot` (`null` | `kind:"setup"` | `kind:"game_plan"` frozen at Start Game).
- `Competitor` (shared shape for Player/Team): `{ id, displayName, score, tiebreakAt }`; `playerToCompetitor`/`teamToCompetitor` map from `PlayerRecord`/`TeamRecord`.
- `AnswerRecord`/`TeamAnswerRecord`: keyed by `clientId`/`teamId` + `questionId`; `gradingStatus`; used to derive per-competitor Answered/Waiting split (`answeredCompetitorIds` Set matched against `competitors`) — no new backend reads, purely derived client-side.
- `RoomPlayer` (Presence-only, ephemeral): explicitly has **no team concept** — team assignment only exists from Game Setup onward via `PlayerRecord.teamId`.

## 7. Important Rules

- Reuse shared Host-workspace components/CSS classes instead of duplicating markup (`HostRoomPanel`, `.host-dashboard-*`, `.live-game-*`).
- One Host-workspace breakpoint (860px) — never introduce a competing one.
- Footers: button-only, no decorative/summary text; genuine errors get their own conditional element elsewhere, never fabricated copy.
- Never use `overflow:hidden`/`clip` as a blind fix for a geometry mismatch — resolve exact pixel math first (border/padding-aware `margin`/`left` calcs); clip only when explicitly proven not to conflict with the fix.
- Prefer IntersectionObserver over scroll-event polling for "has this element reached position X" logic; verify empirically, including initial-state correctness before any observer callback fires.
- This test environment's Browser pane does not composite frames (screenshots fail; CSS transitions/animations do not tick; IntersectionObserver's own callback does not fire) — verify via `getBoundingClientRect`/`getComputedStyle` measurement, not screenshots or timing-dependent CSS.
- Accessibility: never rely on color alone (✓/⏳ icons + text always paired); DOM/tab order must not contradict visual order except where explicitly reasoned through (Live Game's footer-before-monitor tab order tradeoff on desktop).
- Do not fabricate features not backed by existing handlers/state (e.g., no "Previous Question" button was added — no such capability exists in the phase-transition table).

## 8. Next Development Tasks

1. Decide where (if anywhere) `startError`/`continueError`-equivalent failure feedback should live now that footers are button-only, room by room.
2. Consider redesigning `RevealPhase`/`LeaderboardPhase`/`EndedPhase` to match the new Host workspace/Live Game design language (currently still the old `.host-phase` centered-card style).
3. Verify Live Game Control Center at the full required viewport matrix (only 1440×900 and 390×844 done live so far this session).
4. Re-verify dynamic footer corner state on a real (non-headless) browser, since this environment cannot fire IntersectionObserver callbacks to prove the live transition end-to-end.
5. Consider whether `teamReadinessProblem` needs a visible surface again somewhere now that the footer no longer shows it.

## 9. Files Changed (this session, major)

- `src/pages/HostControlPanelPage.tsx` — largest file; sidebar extraction (`HostRoomPanel`), `InviteLobbyPhase`, Dashboard right-panel restructure, footer components/hook, full `QuestionPhase` rewrite.
- `src/pages/HostControlPanelPage.css` — corresponding full styling for all of the above (`.host-dashboard-*`, `.live-game-*`, `.host-room-status-*`, `.host-roster-more`).
- `src/layouts/AppLayout.css` / `AppLayout.tsx` — sticky translucent navbar.
- `src/styles/variables.css` — `--app-header-height`.
- `src/styles/global.css` — `scrollbar-gutter: stable`.
- `src/components/SelectedDecksPanel.tsx`/`.css` (renamed from `GameSetupPanel`), `src/types/deck.ts`, `src/utils/avatars.ts` (new, shared).

## 10. Things Future Claude Must Never Forget

- The Browser pane in this environment never composites frames — screenshots always fail, CSS transitions/animations never visibly tick, and IntersectionObserver callbacks never fire here. Verify layout via DOM measurement; don't trust screenshot or timing-based checks; don't conclude real-browser behavior is broken from this environment alone.
- `scrollbar-gutter: stable` on `html` is load-bearing for the fixed sidebar's pixel-stable position across Host pages of different heights — do not remove without re-solving that shift.
- 860px is the one Host-workspace breakpoint; keep every new Host screen aligned to it.
- Footers across the whole Host workspace (Dashboard, Invite Lobby, Live Game) must share the same navbar-matching translucent surface treatment.
- `RoomPlayer` (Presence) has no team field by design — never assume team data during Invite Lobby.
- Do not add new validation/game-state logic when doing layout work — Answered/Waiting split, category label, etc. are all pure client-side derivations of already-fetched data.
- `HostRoomPanel` and the `.host-dashboard-*` shell are shared — changes to Game Setup's left/right panel affect Invite Lobby too, and vice versa.
- Dynamic footer corner state (Option A) was explicitly chosen by the user over the simpler fixed-floating fallback (Option B) despite this environment's inability to fully verify it — don't silently revert to B.
