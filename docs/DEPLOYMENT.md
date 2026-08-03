# Deployment Guide — Cloudflare Pages

This guide covers deploying the Trivia Night MVP to a public **testing** URL
on Cloudflare Pages, connected to the existing Supabase project. It does not
cover a custom domain, CI/CD beyond Cloudflare's own Git integration, or any
of the hardening that would be required for a real production launch.

> **This deployment is an MVP testing environment. Anonymous creator
> ownership is not secure authentication.** See [Security limitations](#13-security-limitations)
> before sharing the URL widely.

## 1. Required services

- **GitHub** — hosts the source repository Cloudflare Pages builds from.
- **Cloudflare account** — hosts the static frontend on Cloudflare Pages.
- **Supabase project** — already provisioned in earlier milestones. The
  deployment does not create, move, or migrate any Supabase resources; the
  deployed frontend simply points at the same project used in local
  development.

## 2. GitHub repository requirement

The repository must be pushed to GitHub before Cloudflare Pages can import
it (Cloudflare Pages builds from a connected Git repository, not from a
local folder). This repo already has a `main` branch tracked at
`origin` — see [Commit and push](#committing-and-pushing) below for how to
get local changes there.

## 3. Cloudflare Pages setup

1. Open the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Open **Workers & Pages** in the left sidebar.
3. Click **Create application**.
4. Choose the **Pages** tab.
5. Click **Import an existing Git repository**.
6. Connect your GitHub account if this is the first time (Cloudflare will
   ask for repository access — you can scope it to just this repo).
7. Select the Trivia Night repository from the list.
8. Set the **production branch** to `main`.
9. Under build settings, use:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: repository root (the app is not in a subdirectory)
10. Add the environment variables below (see [Environment variables](#6-environment-variables)).
11. Click **Save and Deploy**.
12. Wait for the build to finish (a few minutes). Cloudflare shows live
    build logs during this step.
13. Once it finishes, Cloudflare shows a generated `*.pages.dev` URL — this
    is the public testing URL.

## 4. Build command

```
npm run build
```

This runs `tsc -b && vite build` (see `package.json`) — the TypeScript
project build followed by the Vite production bundle. If either step fails,
the build fails; there is no separate build step to configure.

## 5. Output directory

```
dist
```

Confirmed directly from `vite.config.ts` — no `build.outDir` override is
set, so Vite's default (`dist`) applies. A local `npm run build` was used to
verify this and to confirm `dist/_redirects`, `dist/index.html`, and
`dist/assets/*` are all produced with root-relative paths (no base-path
prefix — see [Vite base path](#vite-base-path) below).

## 6. Environment variables

Set these two in the Cloudflare Pages project's **Settings → Environment
variables** (for both Production and Preview):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase **anon/publishable** key — never the service-role key |

These are the exact names read by `src/services/supabaseClient.ts`. Enter
them directly in the Cloudflare dashboard — never commit real values to the
repository. `.env.example` in the repo root documents these same two names
with blank placeholder values for local setup; `.env.local` (git-ignored)
holds your real local development values and is never read by Cloudflare.

If these are missing or wrong at build time, the app does **not** show a
blank screen: `supabaseClient.ts` falls back to a syntactically valid
placeholder URL so the app still renders, and a visible configuration
banner (`ConfigWarning`) now shows in every environment — not just local
dev — telling the viewer the deployment is missing its Supabase
configuration and needs its environment variables set and redeployed.

## 7. Production deployment

Every push to `main` triggers an automatic rebuild and redeploys to the
project's production URL (`https://<project-name>.pages.dev`). No manual
trigger is needed once the Git integration is connected.

## 8. Preview deployments

Cloudflare Pages automatically builds a **separate preview URL** for any
other branch or pull request, without touching the production deployment.
To test a change before it reaches players:

1. Push your change to a branch other than `main`.
2. Cloudflare builds a preview deployment automatically (visible in the
   Pages project's **Deployments** tab).
3. Open the preview's own `*.pages.dev` URL to test it in isolation.
4. Merge to `main` only once you're satisfied — that's what promotes the
   change to production.

## 9. How to redeploy

Normal case: commit, push to `main`, Cloudflare rebuilds automatically.

To force a rebuild without a new commit (e.g. after changing an environment
variable), open the Pages project → **Deployments** → find the latest
production deployment → **Retry deployment**.

## 10. How to test Host, Player and Stage

Once you have the public URL:

1. **Host** — open the URL in a normal browser window, go to `/host`,
   create a room (Quick Play or Custom Game).
2. **Player** — open the URL in an Incognito/private window (or a second
   device on any network), go to `/join`, enter the room code.
3. **Stage** — open `/stage/<roomcode>` in a third tab/window, or click
   "Open Stage" from the Host panel.
4. Confirm all three see the same room state update live as the Host
   changes setup, players join, and the game progresses.

See [Deployed-site verification](#deployed-site-verification-checklist) in
the final report for the full checklist used before calling a deployment
verified.

## 11. How to inspect deployment logs

Cloudflare Pages project → **Deployments** tab → click any deployment →
**View build log**. This shows the exact `npm install` / `npm run build`
output, useful for diagnosing a failed build (missing dependency, TypeScript
error, etc. — the same errors you'd see running `npm run build` locally).

Runtime errors (things that go wrong in the browser after a successful
build) don't appear in Cloudflare's logs — use the browser's own DevTools
console and Network tab against the deployed URL for those.

## 12. How to roll back

Cloudflare Pages keeps every previous deployment. To roll back:

1. Open the Pages project → **Deployments**.
2. Find the last known-good deployment.
3. Click its **⋯** menu → **Rollback to this deployment**.

This immediately repoints the production URL at that build's already-built
output — no rebuild needed, so it's fast. It does not touch Git history or
the Supabase database; it only changes which built frontend is served.

## 13. Security limitations

This is an MVP **testing** deployment, not a hardened production release:

- **No real authentication exists.** Creator "ownership" of Decks is a
  convenience mechanism keyed on a random id stored in the browser's
  `localStorage` (see `useCreatorId`) — not a verified identity.
- **Every table's Row Level Security policy is fully permissive**
  (`anon full access` — `using (true) with check (true)`, applied
  consistently since migration `0001` and every migration since). This is
  a deliberate, documented choice for the MVP stage (see the inline SQL
  comments in `supabase/migrations/*.sql` and `docs/08-DECISIONS.md`), not
  an oversight — but it means anyone with the anon key (which is, by
  design, embedded in the public JS bundle) can read or write any row in
  any table via the Supabase REST/Realtime APIs directly, not just through
  this app's UI.
- **The anon/publishable key is meant to be public.** It is safe to embed
  in a browser bundle *only because* RLS is supposed to be the real
  boundary — and here that boundary is deliberately wide open for MVP
  simplicity. Do not treat data created in this environment as private, and
  do not point this deployment at a Supabase project holding anything
  sensitive.
- **No service-role or secret key is used anywhere in the frontend** — this
  was audited directly in `src/services/supabaseClient.ts` and confirmed
  nowhere else in `src/` references a service-role key.

Real authentication and a real RLS policy model are out of scope for this
task and for the MVP milestones so far.

## 14. Supabase migration requirements

No new migration is introduced by this deployment task. All five existing
migrations must already be applied, in order, to whichever Supabase project
the deployment's environment variables point at:

```
supabase/migrations/0001_game_state.sql
supabase/migrations/0002_team_mode.sql
supabase/migrations/0003_typed_answers.sql
supabase/migrations/0004_creator_mvp.sql
supabase/migrations/0005_live_lobby_setup.sql
```

If you point the deployment at a *different* Supabase project than the one
used for local development (e.g. a dedicated "public testing" project), run
all five migrations against it via the Supabase SQL Editor, in order, before
testing the deployed app — the app assumes this schema exists and does not
create it itself.

## Vite base path

`vite.config.ts` sets no `base` option, so Vite defaults to `/` — correct
for a Cloudflare Pages deployment served from its own root domain
(`*.pages.dev` or a future custom domain), with no repository-name subpath
the way GitHub Pages project sites typically need. This was confirmed by
inspecting a local production build's `dist/index.html`, which references
`/assets/...` and `/favicon.svg` with no path prefix.

## Node version

Vite 8's own `package.json` declares `"engines": { "node": "^20.19.0 || >=22.12.0" }`
— confirmed by reading `node_modules/vite/package.json` directly rather than
assumed. This repository now pins that same range in its own
`package.json` `engines` field, and adds a `.node-version` file
(`22.12.0`) so Cloudflare Pages' build image selection picks a Node version
Vite actually supports, without guessing.

## Committing and pushing

This task does not push on your behalf without explicit authorization — see
the assistant's final report in-session for the exact file list, suggested
commit message, and the commands to run yourself:

```bash
git add .
git commit -m "Prepare MVP for Cloudflare Pages deployment"
git push origin main
```

## Deployed-site verification checklist

Before calling a deployment "verified", confirm against the actual public
`*.pages.dev` URL (not localhost):

- Landing page loads with no blank screen, no missing CSS, no console errors.
- Directly opening (not just navigating to) `/join`, `/decks`, and a
  refreshed `/host/:roomCode`, `/play/:roomCode`, `/stage/:roomCode`,
  `/decks/:deckId` all load correctly — no Cloudflare 404 page.
- Room creation, Realtime sync, Lobby presence, live setup sync, and Team
  selection all work between a Host tab and a Player tab/device.
- Quick Play, Custom Game, Deck-hosted games, Solo, Team, Multiple Choice,
  Typed Answer, the review queue, multi-Deck progression, Leaderboard,
  Winner, and Play Again all work end-to-end.
- Deck creation, autosave, refresh persistence, Preview, and "Host This
  Deck" all work.
- The QR code and any copied Join/Stage link point at the deployed domain —
  never `localhost`.
- A device on a different network than the Host (e.g. a phone on mobile
  data) can join successfully over the public URL.
