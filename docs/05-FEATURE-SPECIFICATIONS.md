# Feature Specifications — Trivia Night

**Status**: Not started — placeholder — blocked on upstream documents
**Depends on**: [`00-PRODUCT-BIBLE.md`](./00-PRODUCT-BIBLE.md), [`02-EXPERIENCE-PILLARS.md`](./02-EXPERIENCE-PILLARS.md), [`03-USER-PERSONAS.md`](./03-USER-PERSONAS.md), [`04-USER-FLOWS.md`](./04-USER-FLOWS.md)

## Purpose

This document defines the concrete, buildable Version 1 feature set — what screens exist, what each control does, and the acceptance criteria engineering will build against. It is the last stop before technical architecture and implementation.

## Proposed Table of Contents

1. Feature List and Prioritisation (must / should / could, for Version 1 only)
2. Host Features
3. Player Features
4. Shared-Screen Features
5. Question Pack Management (create, import, starter packs)
6. Scoring and Leaderboard Logic
7. Explicitly Out-of-Scope-for-V1 List (cross-referenced against `08-DECISIONS.md`)

## Current Status

Not started. This document cannot be meaningfully written until [`04-USER-FLOWS.md`](./04-USER-FLOWS.md) exists and the team captain question is resolved, since the flow shape determines what features and controls are even needed.

## Dependencies on Other Documents

- **`04-USER-FLOWS.md`** — features exist to serve specific flow steps; this document should not invent screens that don't map back to an agreed flow.
- **`02-EXPERIENCE-PILLARS.md`** — each feature should be checked against the Permanent Product Filter and the pillar-specific "features likely to support/weaken" guidance already documented there.
- **`08-DECISIONS.md`** — the out-of-scope list here should stay consistent with decisions already recorded (e.g. D-013 marketplace, D-014 seasons, D-022 the deferred "Watch Along" experience). Note that individual play (D-007) is superseded by D-017 and is **in scope** for Version 1 via the unified team model — it should not be listed as out of scope.

## Questions That Must Be Answered Before This Document Can Be Completed

- **Blocking**: The team captain model (shared with `04-USER-FLOWS.md`; see `08-DECISIONS.md`, D-015).
- How should team formation/auto-assignment work by default, to avoid the exclusion risk noted in `08-DECISIONS.md`, D-017?
- What is the minimum viable question-pack format for Version 1 — multiple choice only, or also open-text/buzzer-style questions?
- Is a "starter pack" of built-in questions a Version 1 requirement (supporting the Effortless Hosting pillar directly) or a nice-to-have?
- Where is the line between core scoring (Version 1) and future scoring variants (streak bonuses, wildcard/comeback rounds — currently only recorded as hypotheses in `02-EXPERIENCE-PILLARS.md`)?
- How much of "import a trivia pack" needs to be specified now versus left as a technical detail for `07-TECHNICAL-ARCHITECTURE.md`?
