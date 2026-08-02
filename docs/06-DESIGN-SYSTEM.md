# Design System — Trivia Night

**Status**: Not started as a formal document — an early implementation already exists in code
**Depends on**: [`00-PRODUCT-BIBLE.md`](./00-PRODUCT-BIBLE.md), [`02-EXPERIENCE-PILLARS.md`](./02-EXPERIENCE-PILLARS.md)

## Purpose

This document will define the concrete visual and interaction language — colour, typography, motion, and components — that expresses the product personality defined in the Product Bible. Where the Product Bible says what the product should *feel* like, this document says exactly how that feeling is built.

## Proposed Table of Contents

1. Colour System (purple, electric blue, teal, pink, orange, yellow — usage rules, not just a palette)
2. Typography
3. Spacing and Layout Grid
4. Motion and Animation Principles
5. Core Components (buttons, cards, leaderboard, countdown, reveal states)
6. Sound *(if in scope — not yet decided)*
7. Accessibility Standards Built Into the System (contrast, motion reduction, focus states)
8. Interface States (loading, error, empty, disconnected)

## Current Status

Not started as a formal design system document. Note: an initial CSS custom-property system (colours, spacing, radii, gradients) already exists in the codebase at `src/styles/variables.css` and `src/styles/global.css`, created during the earlier project-scaffolding phase, before this documentation effort began. This document should formalise, validate, and extend that starting point rather than contradict it outright — though it may recommend deliberate changes once the product direction from the Product Bible and Experience Pillars is fully accounted for.

## Dependencies on Other Documents

- **`00-PRODUCT-BIBLE.md`** — Section 9 (Product Personality) and Section 15 (Non-Negotiable Experience Rules, including the accessibility rule) directly constrain this document.
- **`02-EXPERIENCE-PILLARS.md`** — especially Pillar 1 (Fun First) and Pillar 6 (Create Memorable Moments), which drive motion and visual-drama decisions; and Pillar 4 (Psychological Safety), which constrains tone in error/incorrect states.

## Questions That Must Be Answered Before This Document Can Be Completed

- Should this document treat the existing `src/styles/variables.css` palette as a validated starting point to formalise, or should the palette be revisited now that the product direction is clearer than it was during initial scaffolding?
- What are the concrete accessibility requirements (contrast ratios, reduced-motion behaviour, focus visibility) this system must satisfy — this ties directly to the Accessibility Requirements section still to be written in `01-PRD.md`?
- Is sound design in scope for Version 1 at all, or is the experience purely visual and motion-based for now?
- How should "reveal drama" (Pillar 6) be expressed as reusable, consistent motion patterns rather than one-off animations per screen?
