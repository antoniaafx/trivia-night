# Product Bible — Trivia Night

## Document Metadata

| Field | Value |
|---|---|
| Title | Trivia Night — Product Bible |
| Version | 0.2 (Draft) |
| Status | Draft — Foundational |
| Last Updated | 2026-08-02 |
| Owner | Antonia Afxentiou (Product Owner) |
| Purpose | Define the identity, values, and non-negotiable rules that guide every future product, design, and engineering decision for Trivia Night. |

This document is the single source of truth for *what Trivia Night is and is not*. When a future decision is unclear, this is the document to check first.

---

## 1. Product Summary

Trivia Night is a live, host-controlled, in-person multiplayer trivia platform. One person hosts from a shared screen — a TV, projector, or laptop — while small teams join instantly from their own phones using a QR code or room code, with no app to install and no account to create. It exists to turn an ordinary room into a shared, competitive, memorable trivia night, with the technology supporting the experience rather than becoming the centre of it.

## 2. Mission

> Make hosting a great trivia night effortless enough that anyone can do it, and playing exciting enough that everyone wants to do it again.

## 3. Product Vision

> Create the easiest and most enjoyable platform for hosting live trivia nights.

Trivia Night succeeds when the software disappears into the background and the room remembers the laughter, the tension, and the last-second comeback — not the interface.

**Public-facing expression:**

> Helping ordinary people transform any room into an unforgettable trivia night.

## 4. Why This Product Exists

Existing options force an uncomfortable trade-off:

- Classroom quiz tools feel institutional, and are increasingly locked behind education or enterprise pricing.
- Party console games require a purchased bundle, a specific device, and give the host no way to write their own questions.
- Improvised, host-led trivia (a verbal quiz or a shared PDF) has no automatic scoring, no visual drama, and puts the entire coordination burden on one person.

Trivia Night exists to fill the gap between these: **free-feeling, instant, visually alive, and flexible enough that anyone can host trivia about anything**, without buying content or installing software.

## 5. Primary User

**The Enthusiastic Amateur Host.**

Someone hosting trivia for people they already know — a friend organising game night, someone throwing a birthday party, a university society organiser, a community group organiser, or the person who volunteers to run an informal work social.

They are **not** a professional quizmaster, a software expert, an event production company, or an IT administrator.

They have:

- A laptop and a shared screen.
- Reliable-enough Wi-Fi.
- Limited preparation time.
- No patience for tutorials or configuration.
- A desire to look organised, capable, and confident in front of the room.

> **Principle** — Every host-facing decision should make this person feel more in control, not less.

## 6. North Star

> When the game ends, people ask: **"When are we playing again?"**

**Core value:**

> Bring people together through fun, inclusive competition.

**Permanent product test:**

> A player who finishes last should still want to play again.

## 7. Core Value Proposition

For a host who wants to run a memorable trivia night without professional tools or preparation time, Trivia Night turns any room with a screen into a live game show — instantly joinable, visually exciting, and requiring nothing from players but their own phone.

## 8. Product Promises

> **Hypothesis** — These are product ambitions, not yet measured or validated outcomes. All four require usability validation once the product is testable end-to-end.

1. Create or launch a game in under 30 seconds.
2. Join a game in under 10 seconds.
3. Understand what to do next without needing instructions.
4. Finish the night wanting to play another round.

## 9. Product Personality

**We are:**

Playful (not childish) · Smart (not intimidating) · Energetic (not overwhelming) · Colourful (not chaotic) · Theatrical (not cheesy) · Polished (not corporate) · Confident · Welcoming · Social · Memorable · Accessible · Modern

**We are not:**

A classroom application · Enterprise software · Cheap-feeling · Cluttered · Confusing · Condescending · Embarrassing · Visually exhausting · Overly serious

> The tone should resemble a warm, confident game-show host — never a lecturer, never a salesperson.

## 10. Product Philosophy

Every proposed **feature** must answer at least one question honestly:

- Does this make hosting easier?
- Does this make playing more exciting?
- Does this make participation feel safer or more inclusive?
- Does this create a memorable shared moment?

> **Principle** — If a feature answers "no" to all four, it should probably not be prioritised, regardless of how interesting it is to build.

Every proposed **decision or setting** should answer a different question: does this choice change what happens next for the host or the player, in a way they would actually notice or care about? If not, the strongest UX move is usually to remove the decision entirely rather than add a control for it.

> **Principle** — The best UX is often achieved not by adding options, but by removing unnecessary decisions.

This is not a call to minimise every choice indiscriminately — some decisions are genuinely load-bearing and deserve to exist. The test is whether the decision changes the data, the flow, or the experience in a way that matters. Play Environment (in-person vs. online) was removed as a host-facing decision because, in this architecture, it changes nothing about what needs to be built — see [`08-DECISIONS.md`](./08-DECISIONS.md), D-016 and D-018. Competition Style (team vs. individual) was kept, and even deliberately asked earlier in the setup flow, because it does change the data model and the join experience — see D-017 and D-019. The principle is only useful if it can explain both outcomes, not just justify removing things.

## 11. The Six Experience Pillars

Full detail lives in [`02-EXPERIENCE-PILLARS.md`](./02-EXPERIENCE-PILLARS.md). Summary:

1. **Fun First** — the product exists to create enjoyable shared experiences.
2. **Healthy Competition** — competition motivates without intimidating.
3. **Social Connection** — the best moments happen between people, wherever they're joining from, not inside the app.
4. **Psychological Safety** — nobody is publicly shamed for a wrong answer.
5. **Effortless Hosting** — the host always feels confident and in control.
6. **Create Memorable Moments** — the product is designed around emotional peaks, not just screens.

## 12. Competition Style and Play Environment

Two separate questions were once bundled into a single "team-first" decision: **how** people compete, and **where** they're playing from. They are now treated as distinct, and only one of them is a choice the host makes.

### Competition Style — how players compete

> **Decision** — Team-based play remains the default Version 1 experience. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-006.

Team play is the default: it encourages conversation and debate, reduces the fear of being individually wrong, creates shared victories and losses, reduces phone-staring, and matches the traditional pub-quiz atmosphere the product is emotionally inspired by.

> **Decision** — Individual competition is also available in Version 1 — not as a separate system, but as a special case of one unified model: a team can have one member or many. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-017.

The host selects Competition Style when creating the game, with Team pre-selected so accepting the default costs no extra effort. The choice stays editable until the first player joins, then locks for the session. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-019.

> **Open Question** — Whether one designated "captain" submits each team's final answer is not yet decided. This remains open for Player Flow and Core Feature definition. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-015.

### Play Environment — where players are located

> **Decision** — Play Environment is deliberately **not** a setting the host chooses. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-016 and D-018.

Players join using a QR code (primary), a copyable join link (secondary), or a manually typed room code (fallback) — whichever suits where they are. Whether everyone is in the same room, one player is joining from elsewhere, or the group is fully distributed, the product behaves the same way. Hybrid participation isn't a special mode; it's simply what happens when different people use different joining methods for the same game.

> **Principle** — This is a direct application of Section 10's newest principle: the strongest UX outcome here came from removing a decision, not adding one.

> **Future Opportunity** — Remote participants currently have no shared physical screen to watch. A responsive "Watch Along" view is an acknowledged real requirement, deferred past Version 1. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-022.

## 13. Emotional Journey

A rough map of the intended feeling at each major moment. This is a design compass, not a locked script — exact screens and copy are defined later in User Flows and Feature Specifications.

| Moment | Intended Emotion |
|---|---|
| Landing | Confidence — "this looks easy and good" |
| Game creation | Confidence, momentum |
| Joining | Curiosity, low-friction relief |
| Lobby | Anticipation, playful energy |
| Round introduction | Anticipation |
| Question | Curiosity, playful pressure |
| Countdown | Playful pressure |
| Submission | Relief, mild suspense |
| Waiting | Anticipation |
| Answer reveal | Surprise |
| Score reveal | Excitement |
| Final leaderboard | Excitement, suspense |
| Winner moment | Celebration |

> **Principle** — No moment on this list should ever produce embarrassment, confusion, or boredom as the dominant feeling.

## 14. Permanent Product Filter

> Does this make hosting easier?
> Does this make playing more exciting?
> Does this make participation feel safer or more inclusive?
> Does this create a memorable shared moment?

If a proposed feature, screen, or interaction cannot honestly answer "yes" to at least one of these, it should be challenged before being added — regardless of who proposed it.

## 15. Non-Negotiable Experience Rules

These are constraints, not preferences. They should be revisited only through an explicit, recorded decision in [`08-DECISIONS.md`](./08-DECISIONS.md) — not silently overridden by a single feature request.

- Never publicly shame a wrong answer.
- Phones support the experience; they never dominate it.
- The host remains in control of pacing at all times.
- Important actions must be recoverable — mistakes should not be catastrophic, for host or players.
- Competition must remain welcoming, even for the team in last place.
- A losing team should still feel included in the moment, not excluded from it.
- Visual excitement must never come at the cost of clarity — a confused player is not a delighted player.
- Accessibility is part of quality from the start, not a future enhancement bolted on later.

## 16. Open Strategic Questions

These are unresolved and intentionally left open. They should be revisited in the documents named, not decided by default.

| Question | Where it gets resolved |
|---|---|
| Does a team use a single "captain" device, or can multiple team members submit? | `04-USER-FLOWS.md`, `05-FEATURE-SPECIFICATIONS.md` |
| How should teams be formed — self-selected, auto-assigned, or host-configured — without risking social exclusion? | `04-USER-FLOWS.md`, `05-FEATURE-SPECIFICATIONS.md` |
| What does the "Watch Along" experience look like for remote participants without a shared screen? | `06-DESIGN-SYSTEM.md` |
| How do recurring "seasons" or leagues work without requiring player accounts? | `05-FEATURE-SPECIFICATIONS.md` |
| What does a lightweight, non-enterprise version of host branding look like, if any? | `05-FEATURE-SPECIFICATIONS.md`, future roadmap |
| What does "psychological safety" mean concretely in UI copy and visual states? | `02-EXPERIENCE-PILLARS.md`, `06-DESIGN-SYSTEM.md` |

> The question "what technical choices would make remote play possible later without a rebuild?" — previously listed here — is substantially resolved: see [`08-DECISIONS.md`](./08-DECISIONS.md), D-016 and D-018. What remains is the narrower, still-open questions above.

## 17. Closing Manifesto

> Trivia Night is not built to impress a screen. It's built to fill a room with noise, arguments over answers, and the kind of laughter that only happens when people are competing for nothing but pride.
>
> If the software is doing its job, nobody in the room is thinking about the software at all.
