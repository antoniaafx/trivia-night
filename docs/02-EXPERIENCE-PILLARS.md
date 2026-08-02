# Experience Pillars — Trivia Night

**Status**: Draft — Foundational
**Depends on**: [`00-PRODUCT-BIBLE.md`](./00-PRODUCT-BIBLE.md)

This document expands each of the six pillars named in the Product Bible into a practical framework for design and engineering reviews. Where the Product Bible states *what* the pillars are, this document explains *how to tell* whether a design decision honours or weakens them.

> Treat "Good examples," "Warning signs," and "Features likely to support/weaken it" as **directional guidance**, not a finished specification. Concrete, buildable features are defined later in [`05-FEATURE-SPECIFICATIONS.md`](./05-FEATURE-SPECIFICATIONS.md). Anything below marked **Hypothesis** or **Open Question** is explicitly not yet decided.

---

## Pillar 1 — Fun First

**Definition**
The product exists to create enjoyable shared experiences. Every other pillar — competition, safety, hosting ease — exists in service of this one. If a design choice makes the product more impressive but less fun, fun wins.

**Why it matters**
Trivia Night has no other reason to exist. It isn't solving a productivity problem — its entire value is the feeling it creates in a room. If that feeling is flat, nothing else about the product matters.

**Desired user feeling**
Lightness, amusement, playful anticipation — the feeling of a good party game, not a piece of software.

**Host implications**
The host should never have to work hard to make the room laugh — pacing, motion, and visuals should generate energy without the host performing on top of it.

**Player implications**
Players should feel like participants in a show, not users of an app. Waiting should feel like anticipation, not friction.

**Shared-screen implications**
The shared screen is the "stage." It should carry most of the theatrical weight (colour, motion, reveal drama) so the host doesn't have to narrate everything.

**Good examples**
- A dramatic countdown before the leaderboard appears.
- Celebratory motion on a correct-answer streak.
- Copy that sounds like a game-show host, not a system message ("Nice guess!" rather than "Answer incorrect.").

**Warning signs**
- Screens that feel like a form or a dashboard.
- Dead air where a moment should land (a reveal with no build-up).
- Copy that reads like software addressing a user rather than a host addressing a room.

**Features likely to support this pillar**
- Animated transitions between game phases.
- Sound and motion cues tied to key moments (question start, reveal, win).
- Host-facing "showmanship" tools, e.g. a deliberate pause before a reveal.

**Features or patterns likely to weaken it**
- Dense settings screens shown mid-game.
- Any flow that requires reading instructions to understand what happens next.
- Long, unexplained loading states.

**Questions to ask in design reviews**
- If all colour and motion were removed, would this screen still make sense — and would it still be fun?
- Does this moment build anticipation, or does it just display information?

**Possible future success signals**
> **Hypothesis** — Not yet measurable. Candidate signals for later: hosts running more than one game per session, unprompted "play again" requests, feedback that names specific moments (e.g. "the countdown").

---

## Pillar 2 — Healthy Competition

**Definition**
Competition should motivate participation without intimidating anyone. Scores, rankings, and reveals should raise excitement, not create winners who feel superior and losers who feel humiliated.

**Why it matters**
Trivia is inherently competitive — and competition is also the easiest pillar to get wrong. Done well, it creates tension and memorable moments. Done poorly, it becomes a public ranking of who is "smart," which directly damages Psychological Safety.

**Desired user feeling**
Suspense and playful pressure that stays enjoyable even when losing — never dread or resignation.

**Host implications**
The host should have some control over *when* and *how often* rankings are shown, rather than the system forcing a full leaderboard after every question.

**Player implications**
A team near the bottom of the leaderboard should still feel there's a path back — through pacing, a surprise question, or simply the next round starting fresh enough that the gap doesn't feel permanent.

**Shared-screen implications**
Leaderboard reveals are one of the biggest "TV moment" opportunities in the product — animated position changes, suspenseful ordering (revealing from last place upward), and a distinct visual state for "the lead has changed."

**Good examples**
- Revealing the leaderboard from the bottom up, building suspense toward the top.
- Visually highlighting when a team's position changes, not just their score.
- Occasional mechanics that keep struggling teams engaged. *(Hypothesis — no specific mechanic is confirmed yet.)*

**Warning signs**
- A full leaderboard shown after every single question, making the gap between first and last feel bigger with no dramatic pacing.
- A team realising by round two that they cannot mathematically catch up, with nothing designed to counter that feeling.
- Numeric-only scores with no framing or personality ("Team Nachos: 40" with no moment built around that number).

**Features likely to support this pillar**
- Host control over leaderboard reveal frequency (e.g. only after certain rounds, not every question).
- Animated rank-change indicators (up/down movement, position swaps).
- Comeback-friendly scoring mechanics. *(Flagged as a future exploration, not a confirmed feature.)*

**Features or patterns likely to weaken it**
- Per-question public display of which *specific* team got a question wrong.
- A running leaderboard visible at all times with no pacing or reveal design.
- Scoring so punishing that one bad round removes any realistic chance of winning.

**Questions to ask in design reviews**
- Could this screen make a team in last place want to stop playing?
- Is the leaderboard reveal a *moment*, or just a table?

**Possible future success signals**
> **Hypothesis** — Candidate signal: teams in the bottom half of the leaderboard continuing to answer at a similar rate to teams near the top, rather than visibly disengaging in later rounds.

---

## Pillar 3 — Social Connection

> **Note** — This pillar's scope was broadened on 2026-08-02 to explicitly cover remote and hybrid participants, not only people physically in the room. A separate "Shared Experience" pillar was proposed and deliberately folded in here instead of added as a seventh pillar. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-021.

**Definition**
The best moments in the product should happen between people — whether they're physically together or joining remotely — not inside the app in isolation. Phones exist to submit answers; conversation, shared reactions, and a shared sense of "we're all in this game together" are the real experience.

**Why it matters**
This is the pillar that most separates Trivia Night from a generic quiz app. If players spend the night staring at their own phone instead of each other — or, for a remote participant, feel like a spectator rather than a real participant — the "game show" vision fails even if the scoring works perfectly.

**Desired user feeling**
Belonging, shared focus, the specific energy of a small group huddled around a decision ("wait, are we sure it's B?") — and, for anyone joining remotely, the feeling of genuinely being in the game rather than watching it from outside.

**Host implications**
Part of the host's role is creating space for discussion — pacing should leave room for debate, not rush people past it. This applies whether a team is huddled at a table or coordinating over a phone call from another location.

**Player implications**
Team-based play (the Version 1 default — see [`00-PRODUCT-BIBLE.md`](./00-PRODUCT-BIBLE.md), Section 12) is the primary mechanism for in-person social connection: a shared decision naturally pulls people into conversation rather than isolating them behind individual screens.

> **Warning sign** — Individual competition, also available in Version 1 (see [`08-DECISIONS.md`](./08-DECISIONS.md), D-017), doesn't provide this same built-in mechanism — there's no shared decision to have a conversation about. This is an accepted trade-off a host makes deliberately when choosing Individual, not a gap to silently compensate for elsewhere.

**Shared-screen implications**
The shared screen should be what everyone looks at together during the big moments (question reveal, leaderboard, winner) — the phone should recede into the background at exactly those moments, for in-person players who can see it.

> **Open Question** — Remote participants have no shared physical screen to look at, and remote teammates have no in-app way to discuss an answer together — they depend entirely on a side-channel (a phone call, their own group chat) the product doesn't provide or control. This is an honest limitation, not yet solved. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-022 (the deferred "Watch Along" experience).

**Good examples**
- A visible state that implies debate is expected and encouraged, not rushed (e.g. a discussion timer rather than an instant-lock answer).
- Minimal on-phone UI during a live question — enough to answer, not enough to read a wall of text alone.

**Warning signs**
- A phone screen so information-rich that players stop looking up at the shared screen entirely.
- Any mechanic that rewards fast individual reaction time over team discussion — this would quietly undermine team play.
- A remote participant only ever seeing their own answer screen, with nothing that makes them feel part of the room's reveal moments.

**Features likely to support this pillar**
- Deliberately minimal player-phone UI during live moments.
- Team name/identity customisation — something to rally around.

**Features or patterns likely to weaken it**
- Chat or messaging features inside the app that substitute for in-room conversation.
- Individual-level detail (e.g. "who on your team answered what") surfaced in a way that fragments team decision-making.

**Questions to ask in design reviews**
- Does this feature give people in the room a reason to look at each other, or a reason to look down at their phone?
- Would this still work if the team had to physically huddle around one phone to decide?
- Would a remote participant feel like a real participant in this moment, or an outside observer?

> **Open Question** — The "team captain" model (whether one designated device submits per team) sits inside this pillar and is not yet decided. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-015, and the Product Bible, Section 12.

**Possible future success signals**
> **Hypothesis** — Candidate signal: observed or reported team-discussion time before answer submission; feedback describing the night as "fun to play together" rather than just "fun to play" — from in-person and remote participants alike.

---

## Pillar 4 — Psychological Safety

**Definition**
Nobody should feel publicly embarrassed for giving a wrong answer. Incorrect answers, low scores, and last place should be neutral game states, never moments of exposure or judgement.

**Why it matters**
Fear of looking stupid in front of friends, coworkers, or a room of strangers is the fastest way to make someone disengage from a party game — and once a team disengages, they don't come back for the rest of the night, let alone want to play again.

> **Note** — Individual competition (available in Version 1 per [`08-DECISIONS.md`](./08-DECISIONS.md), D-017) removes team play's built-in blame-diffusion effect — a wrong answer belongs to one person, not a group. Aggregate-first reveal design (below) is what actually carries this pillar; it must be applied at least as rigorously in Individual mode, not treated as less necessary because "that's team mode's job."

**Desired user feeling**
Safety to guess, safety to be wrong out loud, safety to laugh at a bad answer rather than hide it.

**Host implications**
The host should never be handed a UI that invites singling out a specific team's wrong answer for the room, unless the team itself chooses to own that moment.

**Player implications**
A wrong answer should feel like part of the game's texture, not a personal failure — something the team can laugh about, not something they need to explain.

**Shared-screen implications**
Aggregate results (e.g. "60% of teams got this right") are safer, and often more interesting to a room, than a full public list of who got what wrong.

**Good examples**
- Showing the correct answer plus an aggregate stat ("Most teams picked B") instead of a per-team right/wrong list.
- Neutral, light copy for incorrect answers ("So close!" / "Not this time") rather than clinical or negative language ("Incorrect.").
- Difficulty variety within a round so no single team is stuck being wrong repeatedly.

**Warning signs**
- Any screen that visually singles out the lowest-scoring team by name in a way that reads as mockery rather than fun.
- Copy that sounds judgmental, sarcastic at the player's expense, or exam-like ("0/10 — Incorrect.").
- A run of consecutive hard questions with no easier ones, compounding one team's bad round.

**Features likely to support this pillar**
- Aggregate-first reveal design (percentages, distributions) before or instead of individual call-outs.
- Deliberately tone-checked copy for all incorrect/losing states, rather than generic system language.
- Balanced difficulty curation within rounds.

**Features or patterns likely to weaken it**
- Public, unavoidable "who got it wrong" displays.
- Sound effects or animations that read as mocking on an incorrect answer (a harsh buzzer, a "loser" visual).
- Real-time individual answer visibility to the whole room before everyone has submitted — this creates peer pressure and copying, as well as exposure risk.

**Questions to ask in design reviews**
- If my own team were in last place right now, would this screen make me want to keep playing?
- Does this copy sound like a friendly host, or a scoreboard judging me?

**Possible future success signals**
> **Hypothesis** — Candidate signal: teams that fall behind early continuing to submit answers at a similar rate through the final round, rather than dropping off.

---

## Pillar 5 — Effortless Hosting

**Definition**
The host should feel confident and in control at every stage, from setup through the final leaderboard. The software should absorb preparation, scoring, and coordination effort so the host can focus on the room, not the interface.

**Why it matters**
The Enthusiastic Amateur Host has limited preparation time and no patience for configuration. If hosting feels effortful or risky, this specific person — the primary user — will not host a second time, regardless of how good the player experience is.

**Desired user feeling**
Calm competence — "I've got this," not "I hope I don't break anything in front of everyone."

**Host implications**
Every mid-game host action should be forgiving: easy to undo, hard to break, and clear about what will happen before it happens. No destructive action should be one accidental tap away.

**Player implications**
When hosting goes smoothly, players never notice the host was ever at risk of losing control — the game simply flows.

**Shared-screen implications**
The presentation screen should be readable and controllable from a distance — a host glancing at their phone or laptop while the big screen does the talking.

**Good examples**
- A control panel that makes the "next" action obvious and singular, rather than presenting many equally-weighted options.
- Clear recoverability — pausing a round, correcting a mistake, or reconnecting a dropped team without restarting the game.
- Setup that gets a host from "nothing" to "room full of joined teams" in a small number of steps.
- A single, pre-selected default (e.g. Competition Style defaulting to Team) that a host never has to touch unless they want something different. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-019.

**Warning signs**
- A control that, if tapped by accident, ends the game or loses scores with no confirmation or undo.
- A host needing to explain the interface to players because the interface doesn't explain itself.
- Setup that requires configuring things before the host understands why those choices matter.

**Features likely to support this pillar**
- A minimal, obvious host control panel (a large, clear "next" action; secondary actions visually de-emphasised).
- Built-in starter question packs so a host with zero prep time can still run a full game.
- Confirmation steps only on genuinely destructive actions — over-confirming everything is its own kind of friction.

**Features or patterns likely to weaken it**
- Dense settings/config screens presented before the host understands the product.
- Silent failure states, e.g. a team disconnects and the host has no visibility into it.
- Any point where the host must "trust" that something worked with no on-screen confirmation.

**Questions to ask in design reviews**
- Could a host who has never used this before run a full game without reading anything?
- If the host makes a mistake here, what happens — and is that outcome forgivable?

**Possible future success signals**
> **Hypothesis** — Candidate signal: hosts completing game setup without abandoning the flow partway through; a low rate of "how do I…" support questions once the product has real usage.

---

## Pillar 6 — Create Memorable Moments

**Definition**
The product should be deliberately designed around emotional peaks — specific moments people will talk about afterwards — rather than experienced as a neutral sequence of functional screens.

**Why it matters**
This pillar is what turns "we played a trivia game" into "remember when Team Nachos came back from last place in the final round?" It's the mechanism behind the North Star question: "when are we playing again?"

**Desired user feeling**
A spike — surprise, tension, or celebration — at specific, intentional points in the night, not a flat, evenly-paced experience throughout.

**Host implications**
The host should have tools that help *create* these moments (pacing control, dramatic reveal timing) rather than the moments happening identically and automatically every time.

**Player implications**
Players should be able to sense when a big moment is coming — a final question, a close leaderboard, a tiebreaker — since anticipation is part of what makes the moment land.

**Shared-screen implications**
This is where the shared screen does its heaviest lifting: countdowns, reveal animations, leaderboard movement, and a distinct "winner" sequence at the end all belong here.

**Good examples**
- A visibly tense final countdown before the last question closes.
- A leaderboard reveal that builds from last place to first.
- A clear, celebratory "winning moment" sequence, visually distinct from every other screen in the game.
- A tiebreaker framed as an event, not an inconvenience.

**Warning signs**
- The winning moment looking visually identical to a routine leaderboard update — no sense of occasion.
- Every round feeling the same, with no escalation toward the end of the game.
- Ties or edge cases (identical scores, a dropped connection at a key moment) handled as silent technical fallbacks rather than in-narrative moments.

**Features likely to support this pillar**
- A distinct, celebratory end-of-game sequence, visually and motion-wise different from mid-game reveals.
- Escalating pacing across rounds — later rounds feel higher-stakes than earlier ones.
- Purpose-built handling for close finishes and tiebreakers, rather than treating them as edge cases to suppress.

**Features or patterns likely to weaken it**
- Treating the final screen as "just another leaderboard."
- Uniform pacing that never escalates, so nothing in particular feels like "the" moment of the night.

**Questions to ask in design reviews**
- If someone only saw this one screen out of the whole game, would they remember it?
- Does the ending feel like an event, or like the game just stopped?

**Possible future success signals**
> **Hypothesis** — Candidate signal: unprompted mentions of specific moments (a comeback, a tiebreaker, a reveal) in player feedback, rather than only general satisfaction ratings.

---

## Cross-Pillar Tensions to Watch

Pillars can pull against each other. Design reviews should expect to negotiate between them, not assume they always agree.

| Tension | Between | Note |
|---|---|---|
| Suspenseful leaderboard reveals vs. protecting last-place teams | Healthy Competition ↔ Psychological Safety | Suspense should come from *rank movement and closeness*, not from lingering on who is losing. |
| Dramatic per-question reveals vs. avoiding public exposure | Create Memorable Moments ↔ Psychological Safety | Drama should attach to aggregate outcomes and round-level moments, not to naming individual wrong answers. |
| Rich host controls vs. simplicity for a first-time host | Effortless Hosting ↔ Create Memorable Moments | Advanced pacing and showmanship tools are valuable, but must never be required to run a basic, good game. |
| Offering Individual competition vs. maximising Social Connection | Competition Style flexibility ↔ Social Connection | Individual play removes the built-in "shared decision" moment team play provides. This is a trade-off a host makes deliberately by choosing Individual — not a defect to compensate for elsewhere. See [`08-DECISIONS.md`](./08-DECISIONS.md), D-017. |

> **Principle** — When two pillars conflict, Psychological Safety and Effortless Hosting should generally win over spectacle. A moment that excludes someone, or breaks the host's trust, is not worth the drama it creates.
