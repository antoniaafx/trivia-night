# Trivia Night — Project Memory

Single source of truth for the Host workspace redesign work. Read this before touching `HostControlPanelPage.tsx`/`.css`.

## 1. Project State

- Host workspace (Invite Lobby → Game Setup → Live Game (Question/Reveal) → Leaderboard/Ended) has had a full UX redesign pass this session. All five screens now share one visual language: full-width/wide layouts, no page-level footer bars, floating primary actions, no scroll on desktop.
- Player join flow, Stage (big-screen) view, Deck Library/Editor, and Quick Play content are untouched.
- Known issue (not fixed): `teamReadinessProblem` (unassigned players in Team mode) has no visible surface now that Start Game's footer is button-only; only shown via the button's own disabled state.
- Deferred, not implemented: a real per-Deck "Current Standings" checkpoint mid-game with rank-movement indicators (▲▼—) was requested but **descoped** — the app's phase-transition table only ever reaches `leaderboard` once, after the last Question of the last Deck (`reveal: ["leaderboard","question"]`, `leaderboard: ["ended"]` only, no `leaderboard → question` path back in). Building real per-Deck checkpoints needs a new allowed phase transition, deck-boundary-triggered routing, and a rank-history snapshot to diff against — genuine game-logic work, not a layout change. What shipped instead: the single real end-of-game standings moment (`leaderboard`/`ended`) fully redesigned (wide, modern, one continuous screen), no movement arrows (nothing to compare against), no per-Deck preview.

## 2. Architecture

- Single page component `HostControlPanelPage.tsx` renders every Host-side room phase (`lobby/invite`, `lobby/setup`, `question`, `reveal`, `leaderboard`, `ended`) via conditionals keyed on `room.phase`/`lobbyStage`.
- Realtime split: `useRoomChannel` (Presence, ephemeral "who's online") vs `useGameRoom` (Postgres-backed authoritative state: room, players, teams, answers).
- **"Two states, one component" is the core pattern of this redesign**, used twice:
  - `LiveGamePhase` renders both `question` and `reveal` phases, switched only by a `revealed: boolean` prop.
  - `HostLeaderboardPhase` renders both `leaderboard` and `ended` phases, switched only by an `ended: boolean` prop.
  - In both cases every wrapping element renders unconditionally at the same DOM position in both states — only inner content/the action button swaps. Verified live: identical `getBoundingClientRect()` before/after the transition, and the primary action `<button>` is the same DOM node (not remounted) across it. This is what makes Reveal Answer / Show Winner feel like the screen continuing, not navigating. **Never split either pair back into two separate components/screens.**
- Shared Host workspace shell (CSS): `.host-dashboard` (grid: fixed sidebar + main), `.host-dashboard-sidebar` (fixed left room panel, `position:fixed` ≥860px / `position:static` <860px), `.host-dashboard-panel`/`.host-dashboard-content` (right panel shape owner + padded body).
- `.live-game` (Question/Reveal) and `.host-leaderboard` (Leaderboard/Ended) are both wide, sidebar-free, full-viewport screens (`max-width: var(--max-content-width)`, no scroll ≥860px) — distinct from the two-column Dashboard shell.
- `--app-header-height` (68px, `variables.css`) is what every sticky/fixed Host element offsets from. `scrollbar-gutter: stable` on `html` prevents the fixed sidebar shifting between short/tall pages.
- **Floating primary action pattern** (`.host-floating-action`, global class): no footer surface at all — `position: fixed` ≥860px, aligned to the right edge of the current screen's own content grid (via a per-screen `--host-panel-right-inset` custom property, redeclared with the same formula on each wide screen's own wrapper, mirroring the viewport-centering math `.host-dashboard-sidebar` uses for its own `left`), `bottom: var(--space-lg)`, `z-index: 10`. Below 860px it's a plain static full-width button at the end of the content flow (no fixed positioning — sidesteps mobile safe-area/keyboard/address-bar issues entirely). Used by: Invite Lobby's Continue, Dashboard's Start Game, Live Game's action area (`.live-game-question-actions`, a variant embedded in the Question Card rather than page-level), and the Leaderboard's Show Winner/Play Again.
- Breakpoint convention: **860px is the ONE Host-workspace breakpoint** (sidebar fixed↔static, all two-column↔stacked layouts). Never introduce a competing one.

## 3. UI / UX Decisions (approved, final)

- **No footer bars anywhere in the Host workspace.** The old sticky translucent action-footer (Dashboard/Lobby) and the old page-level Reveal-Answer footer (Live Game) are both gone, replaced by `.host-floating-action` (see §2). Only the primary button is visible — no background plate, no border, no summary/readiness text beside it.
- Host Dashboard/Invite Lobby: fixed left room panel (QR, Room Code, Live status, Open Stage, optional Back to Invite) never moves/resizes; right panel content ends naturally with its own rounded corners (no footer child forcing square-then-rounded corner logic anymore).
- Sidebar vertical rhythm: 3 regions (Back-to-Invite / QR+Code+Live cluster / Open Stage), `gap: var(--space-lg)` minimum, `margin-block:auto` on the middle cluster.
- Genuine action-failure messages (`startError`/`continueError`) render as a conditional alert inside the panel's own content, above the floating button — never fabricated copy, never inside/beside the button itself.
- Dashboard content reserves bottom clearance (`padding-bottom: calc(space-lg*2 + space-md)` ≥860px) so the last row (Game Summary) can always be scrolled fully above the fixed button.
- Deck cards: portrait `aspect-ratio: 3/4`, identical filled/empty dimensions.
- **Live Game Control Center** (`question`+`reveal`, one screen): header (question X of Y, category, large timer — never moves between the two states) + two-column body, 30%/70% (Player Monitor / Question Card). The Question Card is the complete interaction module: title → answer options → hairline divider → primary action, all inside one card (`.live-game-question-actions`), not a page footer. Both columns are grid-stretched to equal height.
  - Pre-Reveal left panel: Answered/Waiting rosters (✓/⏳ icon + text per row), Pause/Resume Timer control underneath.
  - Post-Reveal left panel: heading becomes "Player/Team Results"; rosters become four outcome groups — Correct/Incorrect/No Answer/Pending Review (icon+text on the **group label**, not per row; only non-empty groups render) — plus an always-true summary line ("5 Correct · 2 Incorrect · 1 No Answer"). Pause/Resume Timer is removed entirely (answers are locked). Grouping is a pure client-side derivation of `gradingStatus` on the same already-fetched `AnswerRecord`/`TeamAnswerRecord` rows (`revealAndScore` grades+scores atomically before flipping `phase`, so it's already authoritative by the time any client sees `reveal`) — no new grading logic, no new reads.
  - Action button: `Reveal Answer` → `Continue Anyway — Scores May Still Change` (ghost, pending Typed-Answer review outstanding) → `Next Question`/`Finish Game` (nothing pending). `TypedAnswerReviewQueue` renders inside the scrollable card body when applicable.
  - No `explanation` field exists in the `Question` data model (by design, see `data/questions.ts`) — no explanation UI, not even an empty section.
  - Standalone QR/Room Code/Open Stage fallback card is suppressed on `question`, `reveal`, `leaderboard`, and `ended` (no reason to invite mid-game or post-game).
- **Host Leaderboard/Ended** (`leaderboard`+`ended`, one screen, `HostLeaderboardPhase`): wide (`--max-content-width`, no sidebar), header ("Final Results" eyebrow / "Current Standings" → "Trivia Complete" h2 / "{N} Questions Complete" progress), ranked list (medal for top 3, rank/name/score, generous padding, `justify-content: space-evenly` so few rows still fill the screen instead of sticking to the top), floating Show Winner → Play Again action. `ended` adds a winner-celebration banner (🏆, name(s), points) above the same list using existing gradient/glow tokens — no separate winner page. Renders its own rows (reusing `sortLeaderboard`) rather than the shared `CompetitorLeaderboard` component, which Player/Stage still use unchanged.
- Mobile-first throughout: every floating action becomes a plain full-width in-flow button <860px; Live Game and Leaderboard both stack to single column, auto height.
- Accessibility baseline across all of the above: never rely on colour alone (icon+text pairing everywhere); `role="status"` for one-time polite announcements, never per-row; DOM/tab order matches visual order except Live Game's deliberate footer-before-monitor desktop tab order.

## 4. Components

- `HostRoomPanel` — shared fixed left room panel, used by `GameSetupPhase` and `InviteLobbyPhase`.
- `InviteLobbyPhase`, `GameSetupPhase` (+ `RoomStatusSection`/`GameSummaryCard`/`SelectedDecksPanel`/`DeckPicker`) — Dashboard shell screens; each ends with a `.host-floating-action` button.
- `LiveGamePhase` — Question+Reveal, one component (see §2).
- `LiveGameResultGroup` — one post-Reveal outcome group; icon+text label, truncated name list (`useRosterLimit` + "+N more").
- `HostLeaderboardPhase` — Leaderboard+Ended, one component (see §2/§3).
- `TypedAnswerReviewQueue` — Accept/Reject queue for `pending_review` answers; shared by `LiveGamePhase` and `HostLeaderboardPhase`.
- `useRosterLimit` — viewport-based truncation limit (3/4/6 by breakpoint), reused for both roster and result-group truncation.
- `avatarForClientId`, `RoomQrCode`, `LoadingScreen`, `CompetitorLeaderboard` — unchanged shared components (`CompetitorLeaderboard` still used by Player/Stage, no longer by Host).

## 5. Data Model (fields future work depends on)

- `RoomRecord.phase`: `lobby|question|reveal|leaderboard|ended`. Allowed transitions (`types/game.ts`): `question→reveal`, `reveal→{leaderboard,question}`, `leaderboard→ended`, `ended→lobby`. **No `leaderboard→question` path** — this is why there is only one standings moment per game (see §1).
- `GamePlanSection`/`findSectionForQuestion` (`utils/gamePlan.ts`) already track which Deck each Question belongs to — deck-boundary detection is cheap if per-Deck checkpoints are ever built, but routing through one requires the phase-transition change noted in §1.
- `AnswerRecord`/`TeamAnswerRecord.gradingStatus`: `ungraded|correct|incorrect|pending_review`. Authoritative the instant `phase==="reveal"` (graded+scored atomically in `revealAndScore`).
- `Competitor` (shared Player/Team shape): `{ id, displayName, score, tiebreakAt }`. `score` is a live cumulative total, not a history — no per-checkpoint snapshots exist anywhere.
- `RoomPlayer` (Presence-only) has no team field — team assignment only exists via `PlayerRecord.teamId` from Game Setup onward. The Host itself is never a `Competitor` (filtered out of `scorablePlayers`) regardless of `hostParticipation` — that field's scoring behavior is explicitly unimplemented (see its own doc comment).

## 6. Important Rules

- Reuse shared classes/components instead of duplicating markup (`HostRoomPanel`, `.host-dashboard-*`, `.live-game-*`, `.host-floating-action`).
- 860px is the one breakpoint — never a competing one.
- Never fabricate a feature not backed by real state/handlers (no explanation UI, no movement arrows, no Deck-checkpoint routing — all explicitly out because the data/transitions don't exist).
- Result/outcome colour lives on group labels (icon+text), never colour-alone on individual rows. No red/error token exists in the palette — reuse `--color-orange` for "needs attention" (Incorrect, alerts), `--color-teal` for "positive" (Correct, Answered, podium).
- `LiveGamePhase` and `HostLeaderboardPhase` must each stay ONE component — do not reintroduce separate Reveal or Ended screens.
- Prefer IntersectionObserver over scroll polling when position-based logic is genuinely needed; verify empirically.
- This Browser pane never composites frames — screenshots fail, CSS transitions/animations never tick, IntersectionObserver callbacks never fire here. Verify layout via `getBoundingClientRect`/`getComputedStyle`, not screenshots/timing.

## 7. Next Development Tasks

1. Decide where `startError`/`continueError`-equivalent feedback should live now that every action is button-only (currently: inline alert in each panel's own content, above the floating button — seems settled, revisit only if it stops feeling sufficient).
2. Consider whether `teamReadinessProblem` needs a visible surface again now that footers are gone.
3. If per-Deck standings checkpoints are ever actually wanted: add a `leaderboard → question` transition, deck-boundary-aware routing after Reveal, and a rank-history mechanism (client-side is enough, no schema change needed) for movement indicators. Explicitly not started — see §1.
4. Verify the full viewport/zoom matrix beyond what's been checked live (1280×720 desktop, 390×844 mobile) for Live Game and Leaderboard alike.

## 8. Files Changed (this session, major)

- `src/pages/HostControlPanelPage.tsx` — sidebar extraction, `InviteLobbyPhase`/`GameSetupPhase` restructure, `LiveGamePhase` (Question+Reveal merge, `RevealPhase` deleted), `LiveGameResultGroup`, `HostLeaderboardPhase` (Leaderboard+Ended merge, `LeaderboardPhase`/`EndedPhase` deleted), `.host-floating-action` everywhere a footer used to be, `useStickyFooterAtRest` deleted (dead code once footers were removed).
- `src/pages/HostControlPanelPage.css` — full corresponding styling; `.host-dashboard-start-bar`/`.is-at-rest`/sentinel rules deleted; `.live-game-footer` deleted; new `.host-floating-action`, `.host-leaderboard-*`.
- `src/layouts/AppLayout.css`/`.tsx` — sticky translucent navbar (earlier session work, unchanged this pass).
- `src/styles/variables.css` (`--app-header-height`), `src/styles/global.css` (`scrollbar-gutter: stable`) — unchanged this pass, still load-bearing.

## 9. Things Future Claude Must Never Forget

- Question/Reveal and Leaderboard/Ended are each ONE component apiece — the single most load-bearing architectural fact of this redesign. Never split either pair back into two screens; never make their transition buttons navigate or remount the tree.
- There is only one real leaderboard moment in this app's current architecture (see §1/§5) — do not build or describe a per-Deck standings feature as if it already exists.
- No footer surfaces anywhere in the Host workspace anymore — only `.host-floating-action`, which is fixed+right-aligned-to-content ≥860px and a plain static full-width button below it. Don't reintroduce a background plate/bar.
- `scrollbar-gutter: stable` on `html` is load-bearing for the fixed sidebar's pixel-stable position — do not remove.
- `RoomPlayer` (Presence) has no team field; the Host is never a `Competitor`.
- Do not add new validation/game-state logic while doing layout work — every grouping/derivation introduced this session (Answered/Waiting, Correct/Incorrect/No Answer/Pending Review, ranked list) is a pure client-side read of already-fetched data.
- This dev environment's Vite server can throw a transient `ReferenceError: <component> is not defined` right after a large same-file edit (stale Fast Refresh binding) — self-heals on a hard reload/fresh tab, never reproduced in `tsc --noEmit`/`vite build`. Don't conclude the code is broken from one occurrence; check the production build first.
