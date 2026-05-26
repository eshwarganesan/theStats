# theStats Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-26

## Active Technologies
- TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router), React 19, Zustand 5 (game state), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper) (002-timeout-break-timer)
- In-memory Zustand store (existing). `GameSettings` is currently frozen for the game's duration; this feature extends it with three new numeric fields. No new persistence layer. (002-timeout-break-timer)
- In-memory Zustand store (existing). `GameSettings` gains one new boolean field (`overtimeEnabled`). The existing `overtimeSeconds` field is reused with no shape change. (003-overtime-trigger)
- In-memory Zustand store (existing). No new fields on `GameEvent`, `GameSettings`, or any other type. The events array gains two new explicit mutators (`editEvent`, `deleteEvent`) alongside append and `undoLastEvent`. (004-edit-play-events)

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
- 004-edit-play-events: Added TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router), React 19, Zustand 5, Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper)
- 003-overtime-trigger: Added TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router), React 19, Zustand 5, Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper)
- 002-timeout-break-timer: Added TypeScript 5.6 (strict mode, no escape hatches per Constitution Principle II) + Next.js 15 (App Router), React 19, Zustand 5 (game state), Tailwind CSS 3.4, `clsx` + `tailwind-merge` (existing `cn` helper)


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
