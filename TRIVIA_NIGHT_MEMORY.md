# Trivia Night — Project Memory

## 1. Project State

- Core Host workspace (Invite Lobby → Game Setup/Dashboard → Live Question → Reveal → Leaderboard → Ended) is functional and has had multiple UX redesign passes.
- Player join flow, Stage (big-screen) view, Deck Library/Editor, and Quick Play are functional and untouched in this session.
- Major completed: unified Host workspace layout system (fixed left room panel + right panel + action footer/bar), Live Game Control Center redesign, Question Card-as-interaction-module redesign (removed the Live Game's separate sticky footer; Reveal Answer now lives inside the Question Card itself), **Question/Reveal unification** (Reveal is no longer a separate screen — `LiveGamePhase` renders both `question` and `reveal` room phases from the same component tree, see §2/§3), Deck Library/Game Setup separation, Question Timer system.
- Known issue (flagged, not fixed): `teamReadinessProblem` (unassigned players in Team mode) has no visible surface after the Start Game footer was stripped to button-only; only shown via the disabled button state itself.
- Current priority: Host Lobby/Dashboard footer removal (in progress) — replacing the dark sticky action-footer surface with a floating primary-action button. This will retire the "all Host footers share one translucent surface" decision below (§3) for Lobby/Dashboard specifically; Live Game's in-card action area is unaffected (already footer-less, see Question Card decision below).

## 2. Architecture

- Single large page component `HostControlPanelPage.tsx` renders all Host-side room phases (`lobby/invite`, `lobby/setup`, `question`, `reveal`, `leaderboard`, `ended`) via conditional blocks keyed on `room.phase`/`lobbyStage`.
- Realtime data split: `useRoomChannel` (Presence, ephemeral "who's online") vs `useGameRoom` (Postgres-backed authoritative state: room, players, teams, answers).
- Shared Host workspace shell (CSS): `.host-dashboard` (grid: fixed sidebar + main), `.host-dashboard-sidebar` (the fixed left room panel, `position:fixed` ≥860px, `position:static` stacked <860px), `.host-dashboard-panel`/`.host-dashboard-content` (right panel shape owner + padded body), `.host-dashboard-start-bar` (action footer).
- `--app-header-height` (68px, `variables.css`) is the single source of truth every sticky/fixed Host element offsets from.
- `scrollbar-gutter: stable` on `html` (global.css) — prevents the fixed sidebar shifting a few px between short and tall Host pages (scrollbar-presence mismatch).
- Live Game screen (`LiveGamePhase`) is a separate CSS Grid system (`.live-game`, `grid-template-areas`: header + two-column body), independent of the sidebar+panel dashboard shell, sized to fill the viewport below the navbar with no page scroll.
- **Question and Reveal are the same component, not two screens.** `room.phase === "question" || room.phase === "reveal"` both render `LiveGamePhase`, distinguished only by a `revealed: boolean` prop. Every wrapping element (`.live-game`, header, `.live-game-question`, `.live-game-question-body`/`-actions`, `.live-game-monitor`) renders unconditionally at the same tree position in both states — only the Question Card's action button and the left monitor's content swap. This is what keeps Reveal Answer from causing a layout jump or remount (verified live: identical `getBoundingClientRect()` before/after, and the action `<button>` DOM node itself is provably the same node — same object identity — across the press). The old separate `RevealPhase` component was deleted entirely; do not reintroduce it.
- Breakpoint convention: 860px is the ONE Host-workspace breakpoint (sidebar fixed↔static, dashboard two-col↔stacked, live-game two-col↔stacked). Do not introduce competing breakpoints.

## 3. UI / UX Decisions (approved, final)

- Host Dashboard/Invite Lobby: fixed left room panel (QR, Room Code, Live status, Open Stage, optional Back to Invite) never moves/resizes across screens; right panel scrolls independently.
- Sidebar vertical rhythm: 3 regions (Back-to-Invite / QR+Code+Live cluster / Open Stage) with `gap: var(--space-lg)` minimum + `margin-block:auto` on the middle cluster to absorb extra height — not evenly distributed, not stretched.
- All Host action footers (Start Game, Continue, Live Game's Reveal Answer) share one visual identity: navbar-matching translucent background (`rgba(18,14,41,.45)` + `blur(16px)`, `.88` opaque fallback), same elevation.
- Start Game/Continue footers: **dynamic corner state** — square while sticky mid-scroll, rounded (`var(--radius-lg)`) once the footer reaches its true resting position, via `useStickyFooterAtRest` (IntersectionObserver on a sentinel, not scroll polling). No CSS transition on the radius swap (was found to hang if frames aren't actively composited — instant snap instead).
- Footers show **only the primary action button** — no redundant summary text, no "Ready" copy. A genuine action-failure message (`startError`) is shown as a conditional alert above the footer, not inside it.
- Host Invite Lobby right panel reuses the exact Host Dashboard shell (`HostRoomPanel` shared component), header "HOST LOBBY / Waiting for Players", body = "Players Joining" (live count + avatar+name roster, correct singular/plural grammar, "+N more" truncation).
- Deck cards: portrait `aspect-ratio: 3/4` (final, after reversals), identical filled/empty dimensions.
- Live Game Control Center: header + two-column body, fills viewport, no scroll on desktop. 30%/70% column split (Player Monitor / Question Card). No separate page-level footer — the Question Card is the complete interaction module (title → answer options → hairline divider → primary action), so the action button lives inside the card, pinned to its own bottom edge (`.live-game-question-actions`), not a bar bolted underneath it. Both columns are grid-row-stretched to the same height, so removing the footer row made them read as one balanced two-column surface. DOM order = header → question (body, then actions) → monitor (matches "Information Hierarchy" spec and keeps tab order sane); CSS `grid-template-areas` reorders visually per breakpoint, not DOM. At the 860px breakpoint only `.live-game-question-body` scrolls if content overflows — the actions area never scrolls out of view.
- Player Monitor replaces old aggregate "4/5 answered" counter with named Answered/Waiting rosters (✓/⏳ icon + text, never color alone); "✓ Everyone has answered" replaces an empty Waiting section. New Answered rows get a one-time fade+slide-in (`prefers-reduced-motion` respected).
- Timer control (Start/Pause/Resume) lives under the Player Monitor, not the footer — it's about player progress, not question navigation.
- Timer readout in the header is large (2.75rem), bold, with a purely-supplementary `.is-urgent` color accent at ≤10s (never the sole signal).
- Answer options render as cards (letter badge + text), correct answer host-only-highlighted with a "Correct" tag — same info as the old "(correct)" suffix, restyled.
- Standalone QR fallback card is suppressed during both `room.phase === "question"` **and** `"reveal"` (neither state has room for it, and Reveal needs no QR/room-code/Open Stage — the Host is mid-game, not inviting); still shown unchanged on `leaderboard`/`ended`.
- Mobile-first throughout: Host Dashboard/Lobby footers become full-width buttons <860px; Live Game stacks to single column, auto height (page may scroll only if genuinely necessary — question prioritized over player monitor).
- **Reveal state (left monitor panel):** heading changes from "Players"/"Teams" to "Player Results"/"Team Results"; content changes from Answered/Waiting rosters to four outcome groups — Correct / Incorrect / No Answer / Pending Review (only rendered if non-empty) — each a `LiveGameResultGroup` with the icon+text pairing on the **group label itself** (e.g. "✓ Correct"), not repeated per row (differs deliberately from the pre-Reveal Answered/Waiting rows, which do carry a per-row icon). A summary line ("5 Correct · 2 Incorrect · 1 No Answer") always shows the true total above the groups, even when an individual group's own list is truncated via the shared `useRosterLimit` + "+N more" (`.host-roster-more`, reused). Pause/Resume Timer is hidden entirely once revealed — answers are already locked, no legitimate timer action remains.
- **Reveal state (right Question Card):** identical markup to the pre-Reveal Question Card (title, options, host-only correct-answer treatment) — that content was already Host-only-visible from the moment the Question started, so Reveal changes nothing about it. Only the action area changes: `Reveal Answer` (not revealed) → `Continue Anyway — Scores May Still Change` ghost button (revealed, pending Typed-Answer reviews outstanding) → `Next Question`/`Finish Game` primary button (revealed, nothing pending). `TypedAnswerReviewQueue` (Accept/Reject) renders inside the scrollable card body when applicable, same component reused from Leaderboard's own pending-review queue.
- Result grouping is a **pure client-side derivation** of the same `gradedAnswers` (`AnswerRecord`/`TeamAnswerRecord`) the pre-existing Answered/Waiting split and `computeAggregateReveal` already read — grouped by `gradingStatus` (`correct`/`incorrect`/`pending_review`) instead of collapsed into totals. No new grading logic, no new backend reads. Team mode naturally shows one result per team (never per-member) because `competitors`/`gradedAnswers` were already team-granular before this change.
- No `explanation` field exists anywhere in the `Question` data model (`data/questions.ts` says so explicitly, by design) — the Reveal Question Card renders no explanation section at all, not an empty one. If a future Deck schema adds explanations, wire it into `.live-game-question-body`, not a separate card.

## 4. Components

- `HostRoomPanel` — the shared fixed left room panel (QR/Room Code/Live status/Open Stage, optional Back to Invite), used by both `GameSetupPhase` and `InviteLobbyPhase`.
- `InviteLobbyPhase` — replaces old `InviteLobbyCard`; reuses the full Dashboard shell.
- `GameSetupPhase` / `RoomStatusSection` / `GameSummaryCard` / `SelectedDecksPanel` (deck-card grid) / `DeckPicker` — Host Dashboard right panel.
- `LiveGamePhase` (renamed from `QuestionPhase`) — the Live Game Control Center; renders both the `question` and `reveal` room phases from one component tree (see §2's "same component, not two screens" note). Takes a `revealed: boolean` prop plus both pre-Reveal (`answeredCompetitors`/`waitingCompetitors`) and post-Reveal (`correctCompetitors`/`incorrectCompetitors`/`pendingReviewCompetitors`/`noAnswerCompetitors`) grouped-competitor props from the parent.
- `LiveGameResultGroup` — one outcome group (Correct/Incorrect/No Answer/Pending Review) inside the post-Reveal result monitor; icon+text on the group label, plain truncated name list (`useRosterLimit` + "+N more") underneath. Renders nothing for an empty group.
- `TypedAnswerReviewQueue` — Accept/Reject queue for `pending_review` Typed Answers; shared by `LiveGamePhase` (inside the Question Card body, once revealed) and `LeaderboardPhase` (unchanged call site).
- `useStickyFooterAtRest` — shared hook (IntersectionObserver + sentinel) driving dynamic footer corner state.
- `useRosterLimit` — viewport-based roster truncation limit (3/4/6 by breakpoint).
- `avatarForClientId` (`utils/avatars.ts`) — stable hash → emoji, shared across Room Status, Invite Lobby roster, Player Monitor.
- `RoomQrCode`, `LoadingScreen`, `CompetitorLeaderboard` — unchanged shared components.

## 5. Current Screens

**Host Invite Lobby** — fixed left panel (no Back to Invite) + right panel ("HOST LOBBY / Waiting for Players", Players Joining count+roster) + Continue footer (label: "Continue without players" / "Continue").

**Host Dashboard (Game Setup)** — fixed left panel (with Back to Invite) + right panel (Room Status, Competition, Decks, Question Timer, Question Flow, Host Participation, Game Summary) + Start Game footer.

**Live Game Control Center (`question` AND `reveal` phases, one screen)** — header (question X of Y, category, large timer, never moves between the two phases) / two-column body (Player Monitor left 30%, Question Card right 70%). Question Card is self-contained: title, answer options, divider, primary action button all inside the one card — no separate page-level footer, no QR/room-code/Open Stage. Pressing Reveal Answer does not navigate or remount anything — the same component instance updates in place: left panel becomes "Player/Team Results" (Correct/Incorrect/No Answer/Pending Review groups), the action button becomes Continue Anyway / Next Question / Finish Game. No page scroll on desktop.

**Leaderboard / Ended phases** — unchanged, original simple centered-card layout (`.host-phase`), out of scope for the redesign passes so far. (Reveal was this too until this session's Reveal redesign — see above.)

**Stage / Player screens** — unchanged this session.

## 6. Data Model (fields future work depends on)

- `RoomRecord`: `phase` (`lobby|question|reveal|leaderboard|ended`), `competitionStyle` (`solo|team`), `timerStatus` (`not_started|running|paused|expired`), `deckSnapshot` (`null` | `kind:"setup"` | `kind:"game_plan"` frozen at Start Game).
- `Competitor` (shared shape for Player/Team): `{ id, displayName, score, tiebreakAt }`; `playerToCompetitor`/`teamToCompetitor` map from `PlayerRecord`/`TeamRecord`.
- `AnswerRecord`/`TeamAnswerRecord`: keyed by `clientId`/`teamId` + `questionId`; `gradingStatus` (`ungraded|correct|incorrect|pending_review`) — used to derive per-competitor Answered/Waiting split pre-Reveal (`answeredCompetitorIds` Set) and Correct/Incorrect/No Answer/Pending Review grouping post-Reveal (`resultStatusByCompetitorId` Map, keyed the same way) — no new backend reads, purely derived client-side both times. `revealAndScore` (gameRoomRepository.ts) grades every answer and writes scores in the same transaction as the `phase → "reveal"` flip, so by the time any client observes `phase === "reveal"`, `gradingStatus` is already authoritative — never re-derive correctness client-side.
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
- Live Game's primary action (Reveal Answer / Next Question / Finish Game / Continue Anyway) intentionally has **no** separate footer surface anymore — it's a hairline-divided section inside `.live-game-question` itself (transparent background, same card radius/shadow as the rest of the card). Don't reintroduce a standalone `.live-game-footer`-style bar.
- Question and Reveal must stay ONE component (`LiveGamePhase`) at one DOM position, not two conditionally-rendered screens — that's the whole mechanism that keeps the header/two-column layout from jumping when Reveal Answer is pressed. If Leaderboard/Ended are ever pulled into this same design language, do not merge them into `LiveGamePhase` too unless the same "must not jump on transition" requirement applies to that transition specifically.
- Result-outcome colour (Correct/Incorrect/Pending) lives on the `LiveGameResultGroup` label itself (icon+text together), not per-row and not via colour alone — the app's palette has no dedicated error/red token, so Incorrect reuses `--color-orange` (the same "attention" hue as `.host-style-note` alerts) rather than inventing a new colour.

## 8. Next Development Tasks

1. Decide where (if anywhere) `startError`/`continueError`-equivalent failure feedback should live now that footers are button-only, room by room.
2. Consider redesigning `LeaderboardPhase`/`EndedPhase` to match the new Host workspace/Live Game design language (currently still the old `.host-phase` centered-card style; Reveal already redesigned into `LiveGamePhase` this session).
3. Verify Live Game Control Center (both Question and Reveal states) at the full required viewport matrix beyond what's been done live so far (1280×720, 390×844 mobile).
4. Re-verify dynamic footer corner state on a real (non-headless) browser, since this environment cannot fire IntersectionObserver callbacks to prove the live transition end-to-end.
5. Consider whether `teamReadinessProblem` needs a visible surface again somewhere now that the footer no longer shows it.
6. Optional/deferred by design: per-option vote counts on incorrect Multiple Choice answers post-Reveal (spec allowed this only "if useful and already supported" — not added, data would need new aggregation).

## 9. Files Changed (this session, major)

- `src/pages/HostControlPanelPage.tsx` — largest file; sidebar extraction (`HostRoomPanel`), `InviteLobbyPhase`, Dashboard right-panel restructure, footer components/hook, `QuestionPhase` → `LiveGamePhase` rewrite (now covers both `question` and `reveal` phases; old `RevealPhase` deleted), new `LiveGameResultGroup`.
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
- Question and Reveal are ONE screen (`LiveGamePhase`), not two — this is the single most load-bearing fact about the Live Game Control Center now. Never reintroduce a separate Reveal screen/component; never make Reveal Answer navigate or remount the `.live-game` tree.
- This dev environment's Vite server occasionally threw a transient `ReferenceError: <component> is not defined` inside `HostControlPanelPage` right after a large same-file edit (stale React Fast Refresh module binding) — self-healed on a hard page reload, never reproduced in `tsc --noEmit`/`vite build`/a fresh browser tab. If this recurs, hard-reload (or open a new tab) before concluding the code itself is broken; check the production build first.
