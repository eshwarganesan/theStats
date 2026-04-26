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

## Roadmap (out of scope for v0.1)

- Persistence via Zustand `persist` middleware (localStorage) → server sync.
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
