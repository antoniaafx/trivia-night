# Product Bible — Trivia Night

## Document Metadata

| Field | Value |
|---|---|
| Title | Trivia Night — Product Bible |
| Version | 0.1 (Draft) |
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

Every proposed feature must answer at least one question honestly:

- Does this make hosting easier?
- Does this make playing more exciting?
- Does this make participation feel safer or more inclusive?
- Does this create a memorable shared moment?

> **Principle** — If a feature answers "no" to all four, it should probably not be prioritised, regardless of how interesting it is to build.

## 11. The Six Experience Pillars

Full detail lives in [`02-EXPERIENCE-PILLARS.md`](./02-EXPERIENCE-PILLARS.md). Summary:

1. **Fun First** — the product exists to create enjoyable shared experiences.
2. **Healthy Competition** — competition motivates without intimidating.
3. **Social Connection** — the best moments happen between people in the room, not inside the app.
4. **Psychological Safety** — nobody is publicly shamed for a wrong answer.
5. **Effortless Hosting** — the host always feels confident and in control.
6. **Create Memorable Moments** — the product is designed around emotional peaks, not just screens.

## 12. Team-First Direction

> **Decision** — Team-based play is the primary Version 1 game mode. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-006.

Small teams, not solo players, are the default unit of play. This is deliberate: teams encourage conversation and debate, reduce the fear of being individually wrong, create shared victories and losses, reduce phone-staring, and match the traditional pub-quiz atmosphere the product is emotionally inspired by.

> **Open Question** — Whether one designated "captain" submits each team's final answer is not yet decided. This is recorded as an open decision to be explored during Player Flow and Core Feature definition — not resolved here. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-015.

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
| How do recurring "seasons" or leagues work without requiring player accounts? | `05-FEATURE-SPECIFICATIONS.md` |
| What does a lightweight, non-enterprise version of host branding look like, if any? | `05-FEATURE-SPECIFICATIONS.md`, future roadmap |
| What technical choices today would make remote play possible later without a rebuild? | `07-TECHNICAL-ARCHITECTURE.md` |
| What does "psychological safety" mean concretely in UI copy and visual states? | `02-EXPERIENCE-PILLARS.md`, `06-DESIGN-SYSTEM.md` |

## 17. Closing Manifesto

> Trivia Night is not built to impress a screen. It's built to fill a room with noise, arguments over answers, and the kind of laughter that only happens when people are competing for nothing but pride.
>
> If the software is doing its job, nobody in the room is thinking about the software at all.
