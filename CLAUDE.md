# theStats Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-07-22

## Active Technologies
- TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router), React 19, Zustand 5 (game state), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper) (002-timeout-break-timer)
- In-memory Zustand store (existing). `GameSettings` is currently frozen for the game's duration; this feature extends it with three new numeric fields. No new persistence layer. (002-timeout-break-timer)
- In-memory Zustand store (existing). `GameSettings` gains one new boolean field (`overtimeEnabled`). The existing `overtimeSeconds` field is reused with no shape change. (003-overtime-trigger)
- In-memory Zustand store (existing). No new fields on `GameEvent`, `GameSettings`, or any other type. The events array gains two new explicit mutators (`editEvent`, `deleteEvent`) alongside append and `undoLastEvent`. (004-edit-play-events)
- TypeScript 5.6.3 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15.1 (App Router, Route Handlers, Server Components, middleware), React 19, `@supabase/ssr` 0.10, `@supabase/supabase-js` 2.106, **Zod** (new — for input validation per Constitution Principle VI), existing UI deps (Tailwind 3.4, `clsx`, `tailwind-merge`) (005-user-auth)
- Supabase Postgres. Uses the managed `auth.users` table. Adds one new `public.auth_attempts` table for per-account + per-IP brute-force backoff (Clarification Q4). Schema delivered as Supabase migrations. (005-user-auth)
- TypeScript 5.6.3 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router), React 19, Zustand 5 (existing — using its `persist` middleware), Tailwind CSS 3.4. No new runtime deps. (006-preserve-game-state-on-refresh)
- Browser `localStorage` only. Single key (`thestats.game.v1`) holds the persisted partial of the game state; a sibling key (`thestats.clock.v1`) holds the clock checkpoint `{ clockSeconds, breakSeconds, savedAt }`. No server-side or Supabase involvement for this feature. (006-preserve-game-state-on-refresh)
- TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router), React 19, Zustand 5 (existing — already wrapped with `persist` middleware by feature 006), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper). **No new runtime deps.** (007-possession-arrow)
- Browser `localStorage` only, via the existing `persist` slice introduced by feature 006 (key `thestats.game.v1`). The new `possessionArrow` direction joins the existing partialized fields; the new `possessionArrowEnabled` setting flows through `settings`, which is already persisted. No server-side, Supabase, or backend involvement. (007-possession-arrow)
- TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router), React 19, Zustand 5 (with `persist` + `subscribeWithSelector` middleware), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper). **No new runtime deps.** (008-team-actions)
- In-memory Zustand store, persisted to browser `localStorage` via the existing `persist` slice (key `thestats.game.v1`). The two new event variants join the already-persisted `events` array; no schema-version bump needed (additive, backward-compatible). No Supabase / server involvement. (008-team-actions)
- TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router — Server Components, Server Actions, Route Handlers, middleware), React 19, Zustand 5 (`persist` + `subscribeWithSelector`, existing), `@supabase/ssr` 0.10, `@supabase/supabase-js` 2.106, **Zod** (already added by feature 005 — reused for new endpoint validation), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper). (009-account-library)
- Supabase Postgres — two new tables (`public.profiles`, `public.games`) with RLS. Browser `localStorage` (feature 006 key `thestats.game.v1`) remains for anonymous sessions. No new persistence layer. (009-account-library)

- TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router), React 19, Zustand 5, Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper) (001-adjust-clock-time)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II): Follow standard conventions

## Recent Changes
- 009-account-library: Added TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router — Server Components, Server Actions, Route Handlers, middleware), React 19, Zustand 5 (`persist` + `subscribeWithSelector`, existing), `@supabase/ssr` 0.10, `@supabase/supabase-js` 2.106, **Zod** (already added by feature 005 — reused for new endpoint validation), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper).
- 008-team-actions: Added TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router), React 19, Zustand 5 (with `persist` + `subscribeWithSelector` middleware), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper). **No new runtime deps.**
- 007-possession-arrow: Added TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router), React 19, Zustand 5 (existing — already wrapped with `persist` middleware by feature 006), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper). **No new runtime deps.**


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
