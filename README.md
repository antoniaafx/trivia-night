# Trivia Night

A live trivia game app: one screen hosts the game (big screen / projector) while
players join and answer from their own phones.

This is the **project foundation** — routing, layout, and design system are in
place, but the multiplayer/game logic has not been built yet.

Product direction (vision, personas, flows, decisions) is documented in
[`docs/00-PRODUCT-BIBLE.md`](docs/00-PRODUCT-BIBLE.md) — start there before
making UX or feature decisions.

## Tech stack

- [Vite](https://vitejs.dev/) — build tool and dev server
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [React Router](https://reactrouter.com/) — client-side routing
- [Framer Motion](https://motion.dev/) — animations
- [Lucide React](https://lucide.dev/) — icons
- [Supabase JS client](https://supabase.com/docs/reference/javascript) — ready
  for a future backend (not configured yet)
- [qrcode.react](https://github.com/zpao/qrcode.react) — QR codes for joining a
  game by scanning a code

## Prerequisites

You'll need [Node.js](https://nodejs.org/) installed (version 20 or newer is
recommended). This also installs `npm`. To check what you have, open a
terminal and run:

```bash
node --version
npm --version
```

## Getting started

1. **Install dependencies** (only needed the first time, or after pulling new
   changes that add packages):

   ```bash
   npm install
   ```

2. **Set up your environment variables.** Copy the example file:

   ```bash
   cp .env.example .env.local
   ```

   `.env.local` is your personal, local-only config file — it's already
   git-ignored, so it will never be committed. You can leave the Supabase
   values blank for now since the database isn't wired up yet.

3. **Start the dev server:**

   ```bash
   npm run dev
   ```

4. Open the local URL shown in the terminal — usually:

   ```
   http://localhost:5173
   ```

   The app supports hot module reloading, so changes to the code will show up
   in the browser automatically.

## Available scripts

| Command           | What it does                                      |
| ------------------ | -------------------------------------------------- |
| `npm run dev`      | Start the local development server                 |
| `npm run build`    | Type-check and build a production bundle in `dist/` |
| `npm run preview`  | Preview the production build locally                |
| `npm run lint`     | Run the linter (Oxlint)                             |

## Project structure

```
src/
  components/   Reusable UI pieces (buttons, loading screen, etc.)
  pages/        One component per route/page
  layouts/      Shared page shells (e.g. AppLayout)
  hooks/        Custom React hooks
  context/      React context providers
  services/     External integrations (e.g. the Supabase client)
  data/         Static/local data (e.g. sample questions)
  types/        Shared TypeScript types
  utils/        Small helper functions
  styles/       Global CSS and design tokens (colors, spacing, etc.)
```

## Routes

| Path               | Page                                          |
| ------------------ | ---------------------------------------------- |
| `/`                 | Landing page                                   |
| `/host`             | Host setup (create a room)                     |
| `/host/:roomCode`   | Host control panel for a specific room         |
| `/join`             | Player join page                               |
| `/game/:roomCode`   | Full-screen presentation view for a game       |
| anything else       | 404 page                                       |

## What's next

The current app is a working shell with placeholder pages. The next
development phase will add:

- Supabase project setup (database tables, environment values filled in)
- Real-time multiplayer syncing between host and players
- Actual quiz/question data and game logic
- Player join flow (entering a name + room code, or scanning a QR code)
- Scoreboard and host controls
