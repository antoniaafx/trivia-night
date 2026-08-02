# Product Requirements Document (PRD) — Trivia Night

**Status**: Not started — placeholder
**Depends on**: [`00-PRODUCT-BIBLE.md`](./00-PRODUCT-BIBLE.md), [`02-EXPERIENCE-PILLARS.md`](./02-EXPERIENCE-PILLARS.md), [`03-USER-PERSONAS.md`](./03-USER-PERSONAS.md), [`04-USER-FLOWS.md`](./04-USER-FLOWS.md), [`05-FEATURE-SPECIFICATIONS.md`](./05-FEATURE-SPECIFICATIONS.md)

## Purpose

This is the master Product Requirements Document. It consolidates vision, audience, goals, features, functional and non-functional requirements, and success metrics into one authoritative reference for what is being built and why. It sits one level more concrete than the Product Bible (identity and values) and one level more concrete than the Feature Specifications (buildable detail) — this document is where product decisions become requirements.

## Proposed Table of Contents

1. Product Vision *(agreed in conversation — see [`00-PRODUCT-BIBLE.md`](./00-PRODUCT-BIBLE.md))*
2. Target Audience *(agreed in conversation — not yet formally written into this document)*
3. Goals
4. Core Features (overview)
5. User Personas *(link to [`03-USER-PERSONAS.md`](./03-USER-PERSONAS.md))*
6. User Journeys — Host Flow *(link to [`04-USER-FLOWS.md`](./04-USER-FLOWS.md))*
7. User Journeys — Player Flow *(link to [`04-USER-FLOWS.md`](./04-USER-FLOWS.md))*
8. Navigation and Information Architecture
9. Screen-by-Screen Breakdown
10. Functional Requirements
11. Non-Functional Requirements
12. Database Entities (high level only)
13. Security Considerations
14. Accessibility Requirements
15. Future Roadmap
16. Monetisation Ideas
17. Success Metrics
18. Open Questions

## Current Status

Not started as a formal document. The Product Vision and Target Audience sections have already been discussed and substantially agreed in conversation, and are captured authoritatively in [`00-PRODUCT-BIBLE.md`](./00-PRODUCT-BIBLE.md) and [`08-DECISIONS.md`](./08-DECISIONS.md) (D-001 through D-005). This document should formally restate them and build outward from there once the dependency documents below exist.

## Dependencies on Other Documents

- **`00-PRODUCT-BIBLE.md`** — source of truth for vision, mission, personality, and non-negotiable rules referenced throughout this PRD.
- **`02-EXPERIENCE-PILLARS.md`** — informs Goals, Core Features, and Screen-by-Screen requirements.
- **`03-USER-PERSONAS.md`** — required before User Journeys can be written concretely.
- **`04-USER-FLOWS.md`** — required before Screen-by-Screen Breakdown and Functional Requirements can be finalised.
- **`05-FEATURE-SPECIFICATIONS.md`** — required before Functional Requirements can be finalised in detail.

## Questions That Must Be Answered Before This Document Can Be Completed

- Should Goals be quantified now (e.g. target host retention, session completion rate) or remain qualitative until there is real usage data to calibrate against?
- The team captain model (open — see `08-DECISIONS.md`, D-015) blocks the Player Flow, Screen-by-Screen, and parts of the Functional Requirements sections.
- How much implementation detail belongs in "Database Entities (high level)" here versus being fully deferred to `07-TECHNICAL-ARCHITECTURE.md`?
- Are Monetisation Ideas ready to be brainstormed now, or premature before the core UX and audience decisions are fully settled?
- What is genuinely "Version 1" versus "Future Roadmap" once features are specified in detail — this PRD should not silently expand scope beyond what has been agreed in `08-DECISIONS.md`.
