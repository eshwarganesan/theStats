<!--
SYNC IMPACT REPORT
==================
Version change: (uninitialized template) → 1.0.0
Bump rationale: Initial ratification — replaces unfilled template placeholders with concrete
  governing principles for theStats. Per semver, the first concrete adoption is 1.0.0.

Modified principles:
  - [PRINCIPLE_1_NAME] → I. Test-Driven Development (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Strict Type Safety
  - [PRINCIPLE_3_NAME] → III. Component-Driven Architecture
  - [PRINCIPLE_4_NAME] → IV. Performant & Responsive UX
  - [PRINCIPLE_5_NAME] → V. Engineering Discipline & Industry Standards

Added sections:
  - Technology & Quality Standards (replaces SECTION_2)
  - Development Workflow & Quality Gates (replaces SECTION_3)
  - Governance (filled in)

Removed sections: none

Templates requiring updates:
  - ✅ .specify/templates/tasks-template.md — clarified tests are MANDATORY (TDD principle)
  - ✅ .specify/templates/plan-template.md — Constitution Check gates already reference
       constitution dynamically; no structural change required (verified consistent).
  - ✅ .specify/templates/spec-template.md — no changes required (constitution adds no
       new mandatory spec sections).
  - ✅ .specify/templates/agent-file-template.md — no changes required.
  - ⚠ docs/quickstart.md — does not exist; not applicable.
  - ⚠ README.md — does not exist at repo root; recommended follow-up to add a
       project README that links to this constitution.

Follow-up TODOs:
  - Author a top-level README.md referencing this constitution (deferred — no README
    currently exists in the repository).
  - Backend/API package(s) for the "full stack" scope are not yet present in
    packages/; create or rename when backend work begins.
-->

# theStats Constitution

## Core Principles

### I. Test-Driven Development (NON-NEGOTIABLE)

Every behavior change MUST follow Red → Green → Refactor:

- A failing test (unit, component, integration, or end-to-end as appropriate) MUST be
  written and committed (or staged) BEFORE the implementation that makes it pass.
- Pull requests that introduce new behavior without an accompanying failing-then-passing
  test MUST be rejected.
- The default test stack is Vitest + Testing Library for unit/component coverage and
  Playwright for end-to-end flows. Coverage MUST NOT regress on `main`.

**Rationale**: theStats is a live scorekeeping system where incorrect stats or play-by-play
state corrupts the official record of a game. TDD is the cheapest defense against
regressions in scoring logic, undo/redo, and play-by-play sequencing.

### II. Strict Type Safety

All TypeScript code MUST compile under `strict: true` with no escape hatches:

- `any`, `@ts-ignore`, `@ts-expect-error` (without a written reason), non-null assertions
  (`!`), and unchecked casts (`as Foo`) are PROHIBITED in production code. Narrow with
  type guards or `unknown` instead.
- Public function signatures, exported types, React component props, and store/state
  shapes MUST be explicitly typed — inferred return types are allowed only for trivial
  internal helpers.
- `npm run typecheck` MUST pass on every commit pushed to a shared branch.

**Rationale**: Strict typing is the only mechanism that can statically catch the kind of
shape/contract errors that produce bad stats lines (e.g., a misspelled `fgm` field or a
nullable player reference). The cost of opting out is paid back in production bugs.

### III. Component-Driven Architecture

The Next.js frontend MUST be built from small, composable, single-purpose components:

- Components MUST have a single responsibility; mixing data-fetching, state mutation,
  and presentation in one component is PROHIBITED. Split into container/presentational
  layers or use hooks to isolate concerns.
- Shared UI primitives MUST live in a clearly named shared location (e.g.
  `packages/web/src/components/ui/`) and MUST NOT depend on feature-specific state.
- Each component MUST have an associated test (unit/component) that exercises its
  rendered output and key interactions in isolation.
- Server/Client component boundaries MUST be intentional: data-fetching belongs in
  Server Components or server actions; interactivity belongs in Client Components
  marked with `"use client"`.

**Rationale**: Live scorekeeping has many small, repeated UI surfaces (player rows,
score deltas, foul indicators). Composability keeps these consistent and lets us swap
or restyle them without rewriting screens.

### IV. Performant & Responsive UX

The user-facing experience MUST remain fast and usable on the devices scorekeepers
actually use (tablets and phones courtside):

- All interactive screens MUST be responsive from 360px width upward. Layout MUST NOT
  rely on hover-only affordances.
- A user-initiated action (recording a basket, foul, substitution) MUST reflect in the
  UI within 100ms on a mid-tier mobile device. Heavy work MUST move off the main
  thread or be deferred.
- Production builds MUST meet a Lighthouse Performance score ≥ 90 on the primary
  scorekeeping screen, and Core Web Vitals MUST stay in the "Good" range (LCP < 2.5s,
  INP < 200ms, CLS < 0.1).
- Bundle additions > 20KB gzipped to a route MUST be justified in the PR description.

**Rationale**: A scorekeeper using this app cannot wait on a slow tap during live play.
Performance is a correctness concern, not a polish item.

### V. Engineering Discipline & Industry Standards

All code MUST adhere to widely accepted software engineering practices:

- SOLID principles, DRY, and YAGNI guide design decisions. Premature abstraction is
  a defect; so is duplication that hides a real concept.
- Lint (`npm run lint`) and format checks MUST pass before merge. Warnings introduced
  by a PR MUST be resolved, not suppressed.
- Every PR MUST be reviewed by at least one other contributor (or, in solo periods,
  by the author after a documented self-review checklist) before merging to `main`.
- Public-facing modules MUST have meaningful names; comments are reserved for the
  non-obvious *why*, not the *what*.
- Secrets, credentials, and tokens MUST NEVER be committed. Configuration MUST be
  read from environment variables and validated at startup.

**Rationale**: theStats is intended to grow into a full-stack product. Discipline now
keeps refactor cost linear instead of exponential as the codebase grows.

## Technology & Quality Standards

The canonical stack and tooling are non-negotiable unless amended via the governance
process:

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript 5.6+ in strict mode,
  Tailwind CSS for styling, Zustand for client state.
- **Backend**: Full-stack scope — backend/API service(s) MUST live alongside the web
  package in the `packages/` workspace and MUST share TypeScript types with the
  frontend through a typed contract (shared package, generated types from schema, or
  end-to-end typed RPC such as tRPC). Untyped network boundaries are PROHIBITED.
- **Testing**: Vitest + @testing-library/react for unit/component, Playwright for
  end-to-end. Coverage report MUST be produced via `npm run test:coverage`.
- **Quality gates per PR**: `npm run typecheck`, `npm run lint`, `npm run test:coverage`,
  and `npm run test:e2e` MUST all pass. The aggregate `npm run test:all` exists for
  this purpose and MUST be green in CI.
- **Accessibility**: Interactive elements MUST be keyboard-operable and meet WCAG 2.1
  AA contrast requirements. Components MUST use semantic HTML and ARIA only where
  semantic elements are insufficient.
- **Dependencies**: New runtime dependencies MUST be justified in the PR description
  (problem solved, alternatives considered, bundle-size impact).

## Development Workflow & Quality Gates

- **Branching**: Feature work happens on branches created via the speckit feature
  workflow. Direct commits to `main` are PROHIBITED.
- **Spec-first**: Non-trivial features MUST go through `/speckit.specify` →
  `/speckit.plan` → `/speckit.tasks` before implementation. The plan's Constitution
  Check gate MUST be satisfied (or its violations justified in Complexity Tracking)
  before Phase 0 research begins.
- **Test order within a task**: For every implementation task, the corresponding test
  task MUST be completed first and MUST be observed failing before the implementation
  task begins (Principle I).
- **CI**: All quality gates above run in CI on every PR. A red CI run blocks merge.
- **Reviews**: Reviewers MUST verify constitution compliance — especially Principles I
  (TDD), II (type safety), and IV (performance budgets) — and MUST request changes
  if any principle is violated without justification.

## Governance

- This constitution supersedes ad-hoc conventions, prior practices, and individual
  preferences. Where this document and other guidance conflict, this document wins.
- **Amendments**: Any contributor MAY propose an amendment via a PR that modifies
  `.specify/memory/constitution.md`. The PR description MUST state (a) what is
  changing, (b) why, and (c) the proposed semver bump and rationale. Amendments
  require approval from at least one other contributor.
- **Versioning policy**: Semantic versioning of this document — MAJOR for backward
  incompatible removals or redefinitions of a principle; MINOR for newly added
  principles or materially expanded guidance; PATCH for clarifications, wording, or
  typo fixes that do not change meaning.
- **Compliance reviews**: Every PR review MUST treat the constitution as a checklist.
  Any complexity that violates a principle MUST be recorded in the plan's
  Complexity Tracking table with a concrete justification and a rejected simpler
  alternative.
- **Runtime guidance**: Agent-facing operational guidance (file layouts, command
  conventions, etc.) belongs in agent guidance files (e.g. `CLAUDE.md`,
  `.specify/templates/agent-file-template.md`) — not in this constitution. This
  document is for principles, not procedures.

**Version**: 1.0.0 | **Ratified**: 2026-04-26 | **Last Amended**: 2026-04-26
