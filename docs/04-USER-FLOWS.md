# User Flows — Trivia Night

**Status**: Not started — placeholder — blocked on an open decision
**Depends on**: [`00-PRODUCT-BIBLE.md`](./00-PRODUCT-BIBLE.md), [`02-EXPERIENCE-PILLARS.md`](./02-EXPERIENCE-PILLARS.md), [`03-USER-PERSONAS.md`](./03-USER-PERSONAS.md)

## Purpose

This document maps the concrete, step-by-step journeys through the product — for the host and for players — from landing through to game end, including recovery paths when something goes wrong (a disconnect, a host mistake, a tie).

## Proposed Table of Contents

1. Flow Diagram Conventions Used in This Document
2. Host Flow — Create Game → Lobby → Run Game → End Game
3. Player Flow — Join → Lobby → Play → End
4. Team / Captain Flow *(pending resolution — see Questions below)*
5. Edge Cases and Recovery Flows (disconnects, host mistakes, ties, late joiners)
6. Cross-References to Screens in `05-FEATURE-SPECIFICATIONS.md`

## Current Status

Not started. This document is intentionally blocked: the team captain question — whether one designated device submits per team, or multiple team members can each submit — directly determines the shape of the player join and answer-submission flow. Writing this document before that decision is made risks locking in an assumption without deliberate review.

## Dependencies on Other Documents

- **`00-PRODUCT-BIBLE.md`** — Section 12 (Team-First Direction) and Section 13 (Emotional Journey) set the emotional and structural expectations each flow must satisfy.
- **`02-EXPERIENCE-PILLARS.md`** — especially Social Connection and Effortless Hosting, which directly shape flow pacing and host recoverability.
- **`03-USER-PERSONAS.md`** — flows should be validated against the primary host persona and player persona once defined.

## Questions That Must Be Answered Before This Document Can Be Completed

- **Blocking**: The team captain model (`08-DECISIONS.md`, D-015) — this document is the intended place to resolve it, not just reference it.
- What happens when a player or team disconnects mid-game — is reconnection handling in scope for Version 1 flows, or is it a later resilience pass?
- Does the host flow assume one continuous session from start to finish, or should "pause and resume later" be a supported flow in Version 1?
- How does a late joiner enter a game that has already started, if at all — is this allowed, restricted to the lobby phase only, or explicitly disallowed?
- How are ties handled at the flow level (not just the scoring logic) — is a tiebreaker a distinct flow step, or an edge case handled within the existing leaderboard flow?
