# Decision Log — Trivia Night

**Status**: Living document — Foundational entries below
**Depends on**: [`00-PRODUCT-BIBLE.md`](./00-PRODUCT-BIBLE.md), [`02-EXPERIENCE-PILLARS.md`](./02-EXPERIENCE-PILLARS.md)

This is a lightweight product decision log. Each entry records a decision made, why it was made, what was considered instead, what it costs us, and what would make us reconsider it. New decisions should be appended with the next sequential ID — existing entries should not be renumbered.

**Status values used in this log:**

- **Accepted** — Agreed and currently in effect.
- **Proposed** — Suggested, not yet agreed.
- **Deferred** — Agreed as a direction, but deliberately postponed past Version 1.
- **Open** — Acknowledged as a real, unresolved decision that still needs to be made.

---

## D-001 — In-Person Play Is the Version 1 Focus

- **Date**: 2026-08-02
- **Status**: Accepted
- **Context**: The product could target in-person groups, remote/distributed groups, or both from day one.
- **Decision**: Version 1 is designed exclusively for players physically present in the same room as a shared screen.
- **Rationale**: The core emotional value — a shared screen, face-to-face reaction, a room full of people — is strongest and least ambiguous in person. Splitting focus across in-person and remote from day one would dilute both.
- **Alternatives Considered**: Design for both from the start; design remote-first and treat in-person as secondary.
- **Consequences**: Screen layouts, join flow, and pacing are optimised for a shared physical space. Remote users are not an explicit design target yet (see D-002).
- **Revisit Trigger**: Meaningful, recurring user demand for remote play, or a strategic decision to pursue distributed/remote teams as a market.

---

## D-002 — Remote Play Is Postponed, Not Rejected

- **Date**: 2026-08-02
- **Status**: Deferred
- **Context**: Some target segments (e.g. distributed friend groups, remote teams) would benefit from remote play. It is explicitly out of Version 1 scope per the project brief, but the architecture must not foreclose it later.
- **Decision**: Remote/video-call-based play is deferred past Version 1. Technical and product decisions made now should avoid assumptions that would make remote play impossible to add later.
- **Rationale**: Building for both in-person and remote at once risks a compromised experience for the primary use case (see D-001). Deferring, rather than rejecting, keeps the door open without adding scope now.
- **Alternatives Considered**: Permanently excluding remote play from the product's future; building a remote-first architecture immediately.
- **Consequences**: `07-TECHNICAL-ARCHITECTURE.md` must explicitly evaluate any Version 1 technical choice against "does this make remote play harder to add later?"
- **Revisit Trigger**: Technical architecture work reaching a point where a Version 1 choice would need to be revisited to support remote play; or product strategy prioritising remote play sooner than expected.

---

## D-003 — The Enthusiastic Amateur Host Is the Primary Design Anchor

- **Date**: 2026-08-02
- **Status**: Accepted
- **Context**: The target audience spans many segments (friends, societies, community groups, bars, corporate). Designing for all of them equally risks a diluted, generic product.
- **Decision**: All host-facing UX decisions are optimised for a non-professional host running trivia for people they know, with limited prep time and no patience for configuration.
- **Rationale**: This persona represents the broadest common need across nearly all target segments, and is the persona most likely to abandon the product if hosting feels effortful.
- **Alternatives Considered**: Designing around a professional quizmaster/bar-host persona; designing around a corporate event-organiser persona.
- **Consequences**: Features that primarily serve professional or enterprise hosts (branding, admin permissions, procurement-friendly controls) are not Version 1 priorities. See D-004.
- **Revisit Trigger**: Full persona detail work in `03-USER-PERSONAS.md` surfacing a different primary anchor, or evidence that a different segment is driving the majority of real usage.

---

## D-004 — Corporate Use Is Naturally Served, Not Specifically Designed For

- **Date**: 2026-08-02
- **Status**: Accepted
- **Context**: Corporate team-building is a plausible use case, but designing directly for it pulls in admin permissions, branding/whitelabeling, procurement, and SSO — all in tension with the product's personality and simplicity goals.
- **Decision**: Corporate users are welcome to use the same simple product as everyone else in Version 1. No dedicated corporate/admin features are built now.
- **Rationale**: Building "for" corporate use in Version 1 would compromise the "not corporate," "join in 10 seconds" promises that define the product's personality (see Product Bible, Section 9).
- **Alternatives Considered**: Building a lightweight branding/admin tier now; treating corporate as a co-primary segment alongside casual hosts.
- **Consequences**: Any future corporate/business tier is a roadmap and monetisation question, not a Version 1 design constraint.
- **Revisit Trigger**: A monetisation or roadmap decision to pursue a business tier deliberately (see `01-PRD.md`, Monetisation section, once written).

---

## D-005 — K–12 Classroom Use Is Out of Scope for Version 1

- **Date**: 2026-08-02
- **Status**: Accepted
- **Context**: Designing for children introduces child-safety and compliance requirements (e.g. COPPA, UK/EU children's-data rules, safeguarding around names and any future chat) and a procurement-driven sales motion incompatible with the product's current trust model.
- **Decision**: Version 1 explicitly excludes K–12 classroom use, school administration features, and any child-specific accounts or compliance systems. University and adult-education use remains in scope.
- **Rationale**: None of the compliance and safeguarding work required for minors makes hosting easier or playing more exciting — by the product's own philosophy, that is a strong signal it does not belong in Version 1.
- **Alternatives Considered**: Including basic school-friendly features now to keep the door open; treating schools as a co-primary segment.
- **Consequences**: No child-specific data handling, moderation, or compliance work is required for Version 1. This must be revisited with dedicated legal and safeguarding review before any future targeting of minors.
- **Revisit Trigger**: A deliberate future decision to pursue the education market, which would require its own compliance-aware workstream before any design work begins.

---

## D-006 — Team-Based Play Is the Primary Game Mode

- **Date**: 2026-08-02
- **Status**: Accepted
- **Context**: The product could default to individual play (one phone, one score per person) or team play (a small group sharing one score).
- **Decision**: Team-based play is the primary and default Version 1 experience.
- **Rationale**: Teams encourage conversation and debate, reduce the fear of being individually wrong, create shared victories and losses, reduce phone-staring, and better match the pub-quiz atmosphere the product is emotionally inspired by. This directly supports the Social Connection and Psychological Safety pillars.
- **Alternatives Considered**: Individual play as the default, with teams as an optional mode; supporting both modes equally from launch.
- **Consequences**: Join flow, scoring, and the shared-screen leaderboard are all designed around teams, not individuals, in Version 1. See D-007 and the open captain question, D-015.
- **Revisit Trigger**: `04-USER-FLOWS.md` or early testing revealing that team play adds more friction than value for a specific common scenario.

---

## D-007 — Individual Play Is Postponed

- **Date**: 2026-08-02
- **Status**: Deferred
- **Context**: Companion decision to D-006. Some hosts or occasions (e.g. a solo-friendly quiz night) may prefer individual scoring.
- **Decision**: Individual play is not part of Version 1 and should not influence the initial UX design.
- **Rationale**: Supporting both modes well from day one would double the design and engineering surface area (join flow, scoring, leaderboard) before the primary team experience is even validated.
- **Alternatives Considered**: Building individual play alongside team play as an equal option from launch.
- **Consequences**: Screens, copy, and flows should assume teams throughout Version 1 documentation. Individual play should be treated as a distinct future mode, not a variant to accommodate now.
- **Revisit Trigger**: Clear demand for solo play once the product has real usage, or a strategic decision to broaden game modes post-launch.

---

## D-008 — Fun Is the Emotional North Star

- **Date**: 2026-08-02
- **Status**: Accepted
- **Context**: A trivia product could optimise primarily for accuracy/rigor (a "serious" quiz tool), competitiveness (a leaderboard-first esports-like framing), or fun/social connection.
- **Decision**: Fun and shared social experience are the primary emotional target. The permanent test is: "When the game ends, people ask: 'When are we playing again?'"
- **Rationale**: This aligns with the product vision and the primary host persona, who is running trivia to create a good night, not to run a rigorous assessment.
- **Alternatives Considered**: Optimising for competitive rigor and precise scoring first; optimising for content depth/education value first.
- **Consequences**: Every pillar, feature, and copy decision should be evaluated against the Permanent Product Filter (Product Bible, Section 14) before being prioritised.
- **Revisit Trigger**: None anticipated; this is treated as a foundational identity decision rather than a tactical one.

---

## D-009 — Competition Must Not Cause Embarrassment

- **Date**: 2026-08-02
- **Status**: Accepted
- **Context**: Leaderboards and reveals are core to trivia, but can easily tip into public humiliation of individuals or teams who perform poorly.
- **Decision**: The product must never publicly expose or mock a specific team's wrong answers or low standing in a way that reads as embarrassment rather than fun.
- **Rationale**: This directly protects the Psychological Safety pillar and the permanent product test that a last-place player should still want to play again.
- **Alternatives Considered**: Allowing per-team public wrong-answer displays as a source of comedic drama.
- **Consequences**: Reveal and leaderboard designs default to aggregate-first framing (see `02-EXPERIENCE-PILLARS.md`, Pillar 4). Any feature that surfaces individual/team-level "wrongness" publicly needs explicit design review against this decision.
- **Revisit Trigger**: None anticipated; treated as a non-negotiable rule rather than a tactical preference.

---

## D-010 — Phones Support the Experience Rather Than Dominate It

- **Date**: 2026-08-02
- **Status**: Accepted
- **Context**: A phone-first design (rich UI, lots of information on-device) is common in similar products, but risks pulling attention away from the shared screen and the room.
- **Decision**: Player-facing phone UI is deliberately minimal. The shared screen and in-room conversation carry the experience; the phone is a controller, not the show.
- **Rationale**: Directly supports the Social Connection pillar — the product's differentiation depends on people looking at each other and the shared screen, not at their own phones.
- **Alternatives Considered**: A richer phone experience with more on-device detail, stats, and feedback.
- **Consequences**: Feature and screen proposals that add significant phone-side complexity should be scrutinised against this decision in `05-FEATURE-SPECIFICATIONS.md` and `06-DESIGN-SYSTEM.md`.
- **Revisit Trigger**: None anticipated for Version 1.

---

## D-011 — The Product Is Designed Around Memorable Moments

- **Date**: 2026-08-02
- **Status**: Accepted
- **Context**: A trivia app can be built as a neutral sequence of functional screens, or deliberately designed around emotional peaks.
- **Decision**: Key moments (countdowns, reveals, leaderboard movement, the winning moment) are treated as deliberate design targets, not incidental byproducts of the flow.
- **Rationale**: This is the mechanism behind the North Star ("when are we playing again?") — memorable products get replayed and talked about; functionally correct but flat products do not.
- **Alternatives Considered**: A minimal, utilitarian design that prioritises speed and clarity above all else, treating drama as unnecessary decoration.
- **Consequences**: `02-EXPERIENCE-PILLARS.md` (Pillar 6) and later `06-DESIGN-SYSTEM.md` must define concrete motion, pacing, and visual treatment for these moments rather than leaving them to default component styling.
- **Revisit Trigger**: None anticipated; core to the product's identity.

---

## D-012 — The Software Should Make the Host Feel Confident and In Control

- **Date**: 2026-08-02
- **Status**: Accepted
- **Context**: The primary host persona has low tolerance for risk, configuration, or ambiguity while running a live event in front of people.
- **Decision**: Host-facing tools prioritise clarity, forgiveness (recoverability from mistakes), and a small number of obvious actions over feature completeness or configurability.
- **Rationale**: Directly supports the Effortless Hosting pillar and the primary persona defined in D-003. A host who feels at risk of losing control will not host again, regardless of player experience quality.
- **Alternatives Considered**: A more powerful, configurable host panel aimed at power users or recurring professional hosts.
- **Consequences**: Host control panel design in `05-FEATURE-SPECIFICATIONS.md` should default to minimal and obvious, with advanced controls (if any) clearly secondary and never required to run a basic game.
- **Revisit Trigger**: Evidence from real hosting sessions that more control is needed for common scenarios, without compromising first-time usability.

---

## D-013 — Community Quiz Publishing and Marketplaces Are Future-Scope Ideas

- **Date**: 2026-08-02
- **Status**: Deferred
- **Context**: A long-term ambition exists for a community platform where users publish, browse, download, rate, and favourite quiz packs and creators.
- **Decision**: This is acknowledged as a legitimate future direction but is explicitly not part of Version 1 scope.
- **Rationale**: Version 1 needs to validate the core hosting and playing experience before investing in content marketplace mechanics, moderation, creator tools, and discovery — each of which is a substantial product area in its own right.
- **Alternatives Considered**: Building a minimal public quiz-sharing feature into Version 1 alongside custom/imported/starter packs.
- **Consequences**: Version 1 content model is limited to hosts creating their own packs, importing packs, and using built-in starter packs. Marketplace mechanics are tracked as a future roadmap item, not designed now.
- **Revisit Trigger**: Strong validated demand for pack sharing once real hosts are using custom content, or a strategic decision to prioritise content network effects.

---

## D-014 — Persistent Leagues or Seasons Are Future-Scope Ideas

- **Date**: 2026-08-02
- **Status**: Deferred
- **Context**: Recurring hosts (e.g. bars, societies) may want cumulative standings across multiple sessions ("Team Trivia Titans is in 2nd place for the season"), which implies some persistent identity across nights — in tension with the "no accounts" simplicity of Version 1.
- **Decision**: Persistent leagues/seasons are acknowledged as a legitimate future direction, likely as an optional host-side feature, but are not part of Version 1.
- **Rationale**: Solving cross-session identity properly (without forcing players to create accounts) is a non-trivial design and technical problem that deserves dedicated exploration rather than being bolted on before the single-session experience is validated.
- **Alternatives Considered**: Introducing lightweight host-side "season" tracking in Version 1 using informal identifiers (e.g. consistent team names).
- **Consequences**: Version 1 treats every game as a standalone session with no cross-session score persistence.
- **Revisit Trigger**: Recurring hosts (e.g. weekly bar quiz organisers) requesting season tracking once the core product is in real use.

---

## D-015 — The Team Captain Model Remains an Open Decision

- **Date**: 2026-08-02
- **Status**: Open
- **Context**: Team-based play is confirmed as the Version 1 default (D-006), but it is not yet decided whether each team submits answers through one designated "captain" device, or whether multiple team members can each submit (with some rule resolving conflicts).
- **Decision**: Not yet decided. This entry exists to record the question, not to answer it.
- **Rationale**: This choice significantly affects the join flow, the phone UI, and the social dynamic within a team (a single captain concentrates control and reduces technical conflict; multiple submitters may better reflect real group behaviour but adds complexity around resolving disagreement).
- **Alternatives Considered**: Not applicable yet — options themselves have not been fully explored. To be addressed properly in `04-USER-FLOWS.md` and `05-FEATURE-SPECIFICATIONS.md`.
- **Consequences**: Player Flow and Feature Specification work cannot be finalised until this is resolved. Any interim documentation should explicitly flag flows that assume one model over the other.
- **Revisit Trigger**: This is the trigger — it must be actively resolved during `04-USER-FLOWS.md` work, not left open indefinitely.
