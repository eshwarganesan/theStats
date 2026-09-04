# CourtLog — Digital Scoresheet

A production-grade, frontend-only replica of **InGame by NBN23**: a digital scoresheet and real-time statistics tool for basketball. Built with Next.js 15, TypeScript, Tailwind CSS, and Zustand. There is no backend and no persistence — all game state lives in memory.

---

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Available scripts:

| Command            | Purpose                                    |
| ------------------ | ------------------------------------------ |
| `npm run dev`      | Start the development server               |
| `npm run build`    | Production build                           |
| `npm run start`    | Run the production build                   |
| `npm run lint`     | ESLint over the source tree                |
| `npm run typecheck`| Run TypeScript in `--noEmit` mode          |
| `npm test`         | Run unit + component tests (Vitest)        |
| `npm run test:watch`| Watch mode while developing               |
| `npm run test:coverage`| Coverage report (gates ≥90% global, 100% on `src/lib/**`) |
| `npm run test:e2e` | Run Playwright integration tests           |
| `npm run test:all` | Full pipeline: typecheck + lint + coverage + e2e |

> **Requires** Node.js ≥ 18.18 (Next 15 requirement).

---

## Architecture at a glance

```
src/
├── app/                        # Next.js App Router entry points
│   ├── layout.tsx              # Root layout with font wiring
│   ├── page.tsx                # Landing
│   ├── setup/page.tsx          # Team & game setup
│   └── game/
│       ├── layout.tsx          # Game shell (scoreboard, tabs, clock driver)
│       ├── page.tsx            # Live scoring console
│       ├── stats/page.tsx      # Live box score
│       └── scoresheet/page.tsx # Official digital scoresheet
├── components/
│   ├── ui/                     # Primitives (Button, Input, Modal)
│   ├── setup/                  # Setup-only components
│   └── game/                   # Game-console components
├── hooks/
│   └── useGameClock.ts         # rAF-driven game clock
└── lib/
    ├── types.ts                # Domain types
    ├── constants.ts            # Rule constants (FIBA defaults)
    ├── utils.ts                # Pure utilities (cn, uid, formatters)
    ├── stats.ts                # Pure stats derivation from events
    └── store.ts                # Zustand store — single source of truth
```

### State model — event-sourced

The store holds a single `events: GameEvent[]` array. Every scoring action, foul, stat, substitution, timeout, clock start/stop, and period boundary becomes a discrete event. Two consequences follow:

1. **Undo is trivial.** `undoLastEvent()` simply pops the tail of the array. Substitutions also revert the on-court cache.
2. **Statistics are derived, never stored.** `computeStats()` in `lib/stats.ts` folds the event list into a full box score every time the UI reads it. This guarantees correctness; there is no possibility of drift between "stored stats" and "what actually happened". Callers memoise the result via `useMemo`.

### Clock

`useGameClock` runs a `requestAnimationFrame` loop that calls `tickClock(deltaMs)` on the store while `clockRunning === true`. Using rAF (not `setInterval`) keeps the displayed clock frame-aligned and drift-free.

### Rules

Format-specific constants live in `lib/constants.ts`:

- **5v5** — 4 × 10 min periods, 5 timeouts/game, foul-out at 5 personal fouls, bonus on 5th team foul per period.
- **3v3** — 1 × 10 min period, 1 timeout/game, foul-out at 3 personal fouls.

These are FIBA defaults and can be overridden on the Setup screen.

### Design language

Broadcast-console aesthetic appropriate for arena / courtside use:

- **Typography:** Bebas Neue (display), Manrope (UI), JetBrains Mono (clocks, stats).
- **Palette:** deep charcoal base, orange accent (#FF6B1A), team colours configurable per game.
- **Tabular figures** everywhere numbers appear so digits never jitter.
- Sharp, borderless panels — no decorative rounded corners. Mirrors pro scorekeeping software.

---

## Industry practices applied

- **Strict TypeScript** (`"strict": true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`).
- **Path aliases** (`@/*`) so imports don’t fight `../../../`.
- **Pure domain logic** separated from React (`lib/stats.ts` is framework-agnostic and unit-testable).
- **Single source of truth** via Zustand — no prop-drilling of game state.
- **Controlled components** for every input; client-side validation in `prepareGame()`.
- **Accessibility**: semantic `<dialog>` for modals, `aria-live` / `aria-pressed` where relevant, visible focus rings.
- **Performance**: selectors subscribe to minimal slices of the store; heavy computations go through `useMemo`.
- **No persistence yet** — per spec, data lives only in memory. The store is ready for a persistence middleware (`zustand/middleware/persist`) or a server mutation layer when the backend arrives.

---

## Account library & app shell (feature 009)

Signed-in users get an `/account` page and a saved-game library that syncs live from the local store to Supabase.

### App shell — collapsible sidebar

The root layout renders a persistent left-side [`AppSidebar`](src/components/shell/AppSidebar.tsx) instead of the old top-right AuthPill:

- Sticky flex sibling to `{children}` — page content sits to the right.
- Toggle button uses `aria-expanded` and a transform-based collapse animation to avoid layout thrash.
- Collapsed / expanded state is persisted per browser under `localStorage["thestats.sidebar.v1"]`. On first load it defaults to expanded ≥ 1024 px viewports, collapsed below.
- Slots: `AuthPill` at the top, [`SidebarProfileIcon`](src/components/shell/SidebarProfileIcon.tsx) at the bottom (Server Component; only renders when signed in — clicks navigate to `/account`).

### `/account` — profile + library

[`app/(authenticated)/account/page.tsx`](src/app/(authenticated)/account/page.tsx) is a Server Component behind `requireAuth`. It lazily upserts a `public.profiles` row on first visit and renders the profile section.

- [`ProfileSection`](src/components/account/ProfileSection.tsx) — display name form + change-password form. Both submit via Server Actions in [`actions.ts`](src/app/(authenticated)/account/actions.ts). Password change re-auths with `signInWithPassword` before calling `updateUser` and does **not** invalidate the current session.

The saved-games library used to live on this page (feature 009); feature 010 moved it to a dedicated [`app/(authenticated)/games/page.tsx`](src/app/(authenticated)/games/page.tsx) reachable from a top-level sidebar item. See the "Games page" section below for details.

### Games page (feature 010)

[`app/(authenticated)/games/page.tsx`](src/app/(authenticated)/games/page.tsx) is a Server Component behind `requireAuth`. It fetches the first library batch server-side and mounts the `NewGameCta` + `GameLibrary` composition.

- [`GameLibrary`](src/components/games/GameLibrary.tsx) — Client Component. First batch is server-supplied; subsequent pages load via `GET /api/games?cursor=` when an `IntersectionObserver` sentinel scrolls into view.
- Wrapped in [`LibraryErrorBoundary`](src/components/games/LibraryErrorBoundary.tsx) so a library render failure never blanks out the page shell (FR-012).
- [`NewGameCta`](src/components/games/NewGameCta.tsx) — a "use client" button that clears local persistence, resets the Zustand store, and routes to `/setup` (same three-step order as the home page's `NewGameButton`).
- Sidebar entry point: [`SidebarNavItem`](src/components/shell/SidebarNavItem.tsx) reads `document.body[data-sidebar-collapsed]` to switch between icon-only (rail) and icon+label (overlay) rendering.

### Write-through save

While signed in, edits to the Zustand game store are mirrored to `public.games` by [`WriteThroughController`](src/lib/games/writeThrough.ts):

- Debounced POST-then-PATCH; every write carries a unique `Idempotency-Key` header.
- Bound to the store via `useLibraryWriteThrough`; mounted from the root layout by `<WriteThroughMount>`, which forwards the current Supabase session so it no-ops for anonymous users.
- The Route Handler in [`app/api/games/route.ts`](src/app/api/games/route.ts) reserves the idempotency key via the `record_game_write(p_key, p_game_id)` SECURITY DEFINER RPC before inserting, so retries return the same row.

### Continue / Review / Delete

Each [`LibraryEntry`](src/components/games/LibraryEntry.tsx) row shows the score, status pill, and:

- **Continue** (in-progress only) — fetches the full record and calls `store.hydrateFromLibrary(state)`. If a local in-progress game exists, the store rejects with `{ ok: false, reason: "local_game_present" }` and the row surfaces a confirm-force `<Modal>` (FR-017); on confirmation it hydrates with `force: true`.
- **Review** (finished only) — navigates to `/games/[id]`, a Server Component that renders [`GameReviewView`](src/components/games/GameReviewView.tsx) — read-only `<StatSheet>` + `<GameLog readOnly source={...}>`. (Feature 010 moved the library out of `/account`; the old `/account/games/[id]` URL 301-redirects here for backward compatibility.)
- **Delete** — opens [`DeleteGameDialog`](src/components/games/DeleteGameDialog.tsx). The in-progress variant names the exact event count and current period the user will lose (FR-025).

### Anonymous game on sign-in

After a successful sign-in with an anonymous local game still in `localStorage`, [`AnonymousGameOnSignInPrompt`](src/components/auth/AnonymousGameOnSignInPrompt.tsx) blocks the post-sign-in redirect until the user picks one of three choices: **Save to my account** (POST to `/api/games`, clear local), **Keep local**, or **Discard** (FR-024).

### Persistence

- Supabase Postgres migration [`0002_account_library.sql`](supabase/migrations/0002_account_library.sql) creates `public.profiles`, `public.games`, `public.game_writes` (all RLS-scoped `auth.uid() = owner_id`), the `record_game_write` RPC, and a nightly pg_cron job that prunes `game_writes` older than 24h.
- Generated types live in [`src/lib/supabase/database.types.ts`](src/lib/supabase/database.types.ts). Regenerate with `supabase gen types typescript --local --schema public` after schema changes.
- Anonymous users are unchanged — `localStorage["thestats.game.v1"]` (feature 006) remains the only persistence layer for signed-out sessions.

---

## Roadmap

- Shot chart / heatmap.
- Live sharing (WebSocket broadcast).
- Export scoresheet as PDF / CSV.
- i18n.

---

## Testing & TDD

This project follows a test-driven development workflow. Every behavior change lands with the test that proves it.

### Stack

- **Vitest** + **React Testing Library** for unit and component tests (`*.test.ts(x)` colocated next to source).
- **Playwright** (real Chromium) for integration tests of full user workflows (`tests/e2e/*.spec.ts`).
- **v8** coverage with thresholds enforced in `vitest.config.ts`:
  - `src/lib/**` — 100% statements, branches, functions, and lines.
  - Everything else (excluding `src/app/**`, which is exercised by Playwright) — 90%.
- **GitHub Actions** (`.github/workflows/ci.yml`) runs `typecheck → lint → test:coverage → test:e2e` on every PR and on every push to `main`. A failure on any step blocks merge.

### TDD loop

1. **Red** — write the failing test first. For pure logic, that's a Vitest test in `src/lib/`. For UI behavior, a component test next to the component, or a Playwright spec for a user-visible flow.
2. **Green** — implement the minimum change that makes the test pass. Run `npm run test:watch` while editing for instant feedback.
3. **Refactor** — clean up while the suite stays green.

### Where new behavior should live

- Pure rules of the game (scoring, foul-outs, bonus, period roll-ups) → `src/lib/stats.ts`. These are the cheapest tests to write and run, and they're the load-bearing logic.
- State transitions (events, lifecycle, clock) → `src/lib/store.ts`. Reset between tests via `useGameStore.getState().resetAll()`.
- UI presentation → component tests with the seeded store (see `src/test/seed.ts`).
- Whole-flow user journeys → Playwright specs against `npm run dev`.

If a feature is failing the coverage gate, add tests rather than lowering thresholds. If a branch is genuinely unreachable, refactor to remove it (matches the project's "don't validate scenarios that can't happen" guideline).

---

## License

MIT — use as a study reference or production starting point.
