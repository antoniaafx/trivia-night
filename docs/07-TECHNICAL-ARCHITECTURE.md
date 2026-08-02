# Technical Architecture — Trivia Night

**Status**: Not started — intentionally last in sequence
**Depends on**: [`01-PRD.md`](./01-PRD.md), [`04-USER-FLOWS.md`](./04-USER-FLOWS.md), [`05-FEATURE-SPECIFICATIONS.md`](./05-FEATURE-SPECIFICATIONS.md)

## Purpose

This document will define the technical approach — realtime architecture, data model, and hosting/infrastructure — needed to support the agreed product requirements, without over-building for scale or features that have not yet been agreed.

## Proposed Table of Contents

1. Realtime Architecture (host/player synchronisation)
2. Data Model (rooms, teams, questions, scores — implementation-level detail, building on the high-level entities in `01-PRD.md`)
3. Supabase Usage (realtime channels, storage, and whether/how auth is involved)
4. Client Architecture (building on the existing Vite/React/TypeScript foundation)
5. Scaling Considerations (today's 2–30 player / 6–12 team target, with room to grow)
6. Remote-Play Readiness (what today's choices must not foreclose, per `08-DECISIONS.md`, D-002)
7. Non-Functional Requirements This Architecture Must Satisfy

## Current Status

Not started. This is deliberately the last document in the set — it should be derived from agreed product requirements and flows, not written ahead of them. Writing this before `01-PRD.md`, `04-USER-FLOWS.md`, and `05-FEATURE-SPECIFICATIONS.md` exist risks technical decisions driving the product, rather than the reverse.

## Dependencies on Other Documents

- **`01-PRD.md`** — especially the Functional Requirements, Non-Functional Requirements, and Database Entities (high level) sections, once written.
- **`04-USER-FLOWS.md`** — the realtime architecture must support the actual host/player flows, including whatever the team captain resolution turns out to be.
- **`05-FEATURE-SPECIFICATIONS.md`** — feature acceptance criteria will drive specific technical requirements (e.g. how question packs are imported and stored).

## Questions That Must Be Answered Before This Document Can Be Completed

- What are the actual non-functional requirements (latency tolerance, reconnect/offline behaviour, acceptable failure modes) once defined in `01-PRD.md`?
- Does the "remote play must not be foreclosed" constraint (`08-DECISIONS.md`, D-002) imply any specific architectural pattern now — for example, avoiding assumptions that the host and players share a local network?
- What is the realistic ceiling to architect for now, given the stated Version 1 scale (2–30 players, 6–12 teams), while still leaving room to grow without a full rebuild?
- How much of the existing scaffolding (`src/services/supabaseClient.ts`, the current folder structure) should this document assume as fixed versus open to revision?
