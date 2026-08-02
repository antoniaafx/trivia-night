# User Flows — Trivia Night

**Status**: Not started — placeholder — blocked on an open decision
**Depends on**: [`00-PRODUCT-BIBLE.md`](./00-PRODUCT-BIBLE.md), [`02-EXPERIENCE-PILLARS.md`](./02-EXPERIENCE-PILLARS.md), [`03-USER-PERSONAS.md`](./03-USER-PERSONAS.md)

## Purpose

This document maps the concrete, step-by-step journeys through the product — for the host and for players — from landing through to game end, including recovery paths when something goes wrong (a disconnect, a host mistake, a tie).

## Proposed Table of Contents

1. Flow Diagram Conventions Used in This Document
2. Host Flow — Create Game (including Competition Style selection) → Lobby → Run Game → End Game
3. Player Flow — Join (via QR Code, Join Link, or Room Code) → Lobby → Play → End
4. Team Formation and Captain Flow *(captain model pending resolution — see Questions below)*
5. Remote and Hybrid Participation *(a natural extension of the Player Flow per D-018, not a separate flow)*
6. Edge Cases and Recovery Flows (disconnects, host mistakes, ties, late joiners, the Competition Style lock)
7. Cross-References to Screens in `05-FEATURE-SPECIFICATIONS.md`

## Current Status

Not started. Competition Style, Play Environment, and the joining mechanism are now resolved at the product level (see `08-DECISIONS.md`, D-016–D-019) and are available as firm input to this document. This document remains genuinely blocked on one thing: the team captain question — whether one designated device submits per team, or multiple team members can each submit — which directly determines the shape of the team join and answer-submission flow. Writing this document before that decision is made risks locking in an assumption without deliberate review.

## Dependencies on Other Documents

- **`00-PRODUCT-BIBLE.md`** — Section 12 (Competition Style and Play Environment) and Section 13 (Emotional Journey) set the structural and emotional expectations each flow must satisfy.
- **`02-EXPERIENCE-PILLARS.md`** — especially Social Connection and Effortless Hosting, which directly shape flow pacing and host recoverability.
- **`03-USER-PERSONAS.md`** — flows should be validated against the primary host persona and player persona once defined.
- **`08-DECISIONS.md`** — D-015 (captain, open), D-017 (unified team model), D-018 (joining/hybrid), D-019 (Competition Style lock behaviour), D-022 (Watch Along, deferred) all constrain what this document can and cannot assume.

## Questions That Must Be Answered Before This Document Can Be Completed

- **Blocking**: The team captain model (`08-DECISIONS.md`, D-015) — this document is the intended place to resolve it, not just reference it.
- How should team formation work by default — self-selected, auto-assigned to balance group sizes, or host-configured — to avoid the exclusion risk noted in `08-DECISIONS.md`, D-017?
- How is the Competition Style "lock on first join" (`08-DECISIONS.md`, D-019) represented in the flow — does the host see an explicit state change, and what happens if they want to change it after locking (e.g. must they start a new room)?
- What happens when a player or team disconnects mid-game — is reconnection handling in scope for Version 1 flows, or is it a later resilience pass?
- Does the host flow assume one continuous session from start to finish, or should "pause and resume later" be a supported flow in Version 1?
- How does a late joiner enter a game that has already started, if at all — is this allowed, restricted to the lobby phase only, or explicitly disallowed?
- How are ties handled at the flow level (not just the scoring logic) — is a tiebreaker a distinct flow step, or an edge case handled within the existing leaderboard flow?
- The "Watch Along" experience for remote participants (`08-DECISIONS.md`, D-022) is explicitly deferred — these flows should note where a remote participant's experience is intentionally thinner in Version 1, not attempt to design that experience here.
