# CLAUDE.md — Cube Pattern Game

## Project Overview

A **3D cube pattern memory game** built with React + Vite. Players memorize sequences of highlighted cube faces and reproduce them. Features 10 difficulty levels, two game modes (color/number), authentication, leaderboards, cognitive performance reports, and sound effects.

The UI language is **Korean** throughout (face names, labels, button text, comments).

## Tech Stack

- **Frontend**: React 19 (JSX, no TypeScript), Vite 6
- **Backend/DB**: Supabase (auth, PostgreSQL, storage for avatars)
- **Styling**: All CSS-in-JS via inline styles (no CSS files, no CSS modules)
- **Font**: Outfit (loaded via Google Fonts in `index.html`)
- **Sound**: Web Audio API (no external audio files)
- **No router** — single-page app, one component tree

## Project Structure

```
├── index.html                    # Entry HTML, font preloading, global reset
├── package.json                  # Dependencies (react, supabase-js)
├── vite.config.js                # Vite config (host 0.0.0.0, port 5174)
├── supabase_schema.sql           # Initial DB schema (rankings, cognitive_sessions)
├── supabase_migration_auth.sql   # Auth migration (profiles, user_id columns, RLS)
└── src/
    ├── main.jsx                  # React root mount
    ├── supabaseClient.js         # Supabase client (gracefully null if env vars missing)
    └── CubePatternGame.jsx       # Entire game (~2800 lines, single component file)
```

## Key Architecture Notes

- **Single-file component**: Nearly all logic lives in `src/CubePatternGame.jsx`. This includes the game state machine, 3D cube rendering, sound engine, Supabase data fetching, auth flows, rankings, cognitive reports, and all UI.
- **No component library or state management** — pure React hooks (`useState`, `useRef`, `useCallback`, `useEffect`).
- **3D cube** is rendered with CSS `transform-style: preserve-3d` and manual rotation math (not Three.js/WebGL). Safari compatibility helpers are included.
- **Supabase is optional** — the app works offline using localStorage fallbacks when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not set.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5174)
npm run build        # Production build to dist/
npm run preview      # Preview production build
```

## Environment Variables

Set in `.env` or `.env.local` (git-ignored):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Database Schema

Two SQL files define the Supabase schema (run in Supabase SQL Editor):

1. `supabase_schema.sql` — creates `rankings` and `cognitive_sessions` tables with public RLS policies
2. `supabase_migration_auth.sql` — adds `profiles` table, `user_id` columns, auth-based RLS, and auto-profile creation trigger

### Tables

| Table | Purpose |
|---|---|
| `rankings` | Leaderboard entries (score, level, time, accuracy, composite_score, game_mode, player_name, user_id) |
| `cognitive_sessions` | Per-session cognitive data for reports (score, level, time, accuracy, max_combo, device_id, user_id) |
| `profiles` | User nicknames linked to Supabase auth |

## Game Mechanics

- **10 levels** with increasing difficulty (pattern length 3→8, rounds 3→4, time limits 15s→6s)
- **Two modes**: `color` (face colors) and `number` (numbers 1-6 on faces)
- **Scoring**: composite score from base score, time bonus, and accuracy
- **Combo system**: consecutive correct answers boost score
- **Cognitive report**: tracks memory, reaction time, pattern recognition, focus, and creativity metrics

## Conventions

- **No test framework** is configured — there are no tests
- **No linter/formatter** is configured
- **Commit messages** are in Korean, prefixed with `feat:`, `fix:`, etc.
- All user-facing text is in Korean
- CSS is inline (style objects), not in separate files
- The app targets mobile (iPhone safe area support) and desktop

## Common Patterns in the Code

- `localStorage` is used as fallback/cache for rankings and cognitive history
- Async Supabase calls use `try/catch` with silent fallback to local data
- Sound functions (`playTone`, `playFaceSound`, etc.) are module-level, not inside React components
- Device identification uses a UUID stored in `localStorage` (`cube_device_id`)
- Avatar uploads go to a Supabase storage bucket named `avatars`

## Things to Watch Out For

- `CubePatternGame.jsx` is very large (~2800 lines). Consider the full file when making changes — state and logic are tightly coupled within the single component.
- The 3D cube uses both CSS transforms and manual pointer/touch event handling for rotation. Changes to cube geometry must account for both mouse and touch interactions.
- Supabase client can be `null` — all Supabase calls must guard against this (check `supabase` before using).
