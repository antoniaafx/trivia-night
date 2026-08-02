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
6. Remote and Hybrid Joining (already a natural consequence of link/QR/room-code joining per D-018 — this section instead covers presentation-screen responsiveness, latency/reconnect tolerance across variable networks, and link-sharing safeguards, per D-002 as amended and D-018)
7. Non-Functional Requirements This Architecture Must Satisfy

## Current Status

Not started. This is deliberately the last document in the set — it should be derived from agreed product requirements and flows, not written ahead of them. Writing this before `01-PRD.md`, `04-USER-FLOWS.md`, and `05-FEATURE-SPECIFICATIONS.md` exist risks technical decisions driving the product, rather than the reverse.

## Dependencies on Other Documents

- **`01-PRD.md`** — especially the Functional Requirements, Non-Functional Requirements, and Database Entities (high level) sections, once written.
- **`04-USER-FLOWS.md`** — the realtime architecture must support the actual host/player flows, including whatever the team captain resolution turns out to be.
- **`05-FEATURE-SPECIFICATIONS.md`** — feature acceptance criteria will drive specific technical requirements (e.g. how question packs are imported and stored).

## Questions That Must Be Answered Before This Document Can Be Completed

- What are the actual non-functional requirements (latency tolerance, reconnect/offline behaviour, acceptable failure modes) once defined in `01-PRD.md`?
- Given `08-DECISIONS.md` D-018 confirms clients never assume a shared local network, what are the specific non-functional tolerances (latency, reconnect windows) needed to keep remote and in-person players feeling equally "in the game"?
- What does the unified team-of-N data model (`08-DECISIONS.md`, D-017) imply for the schema — is a team simply a row with a variable-length member list, and does that cleanly support both Competition Styles without a schema fork?
- What lightweight safeguard (e.g. link expiry, join rate-limiting) is appropriate for Version 1 to keep invite-only links from becoming effectively public, per the caveat noted in `08-DECISIONS.md`, D-018?
- What is the realistic ceiling to architect for now, given the stated Version 1 scale (2–30 players, 6–12 teams), while still leaving room to grow without a full rebuild?
- How much of the existing scaffolding (`src/services/supabaseClient.ts`, the current folder structure) should this document assume as fixed versus open to revision?
