/**
 * Zod schemas at the games API boundary (feature 009-account-library).
 *
 * Per Constitution Principle VI: every Route Handler MUST validate its
 * request body / query params with a schema validator. These schemas are
 * strict at the top level (`.strict()` — unknown keys rejected) but allow
 * `.passthrough()` on inner records like Team / GameSettings so a store
 * schema evolution does not silently break every API call. Whenever a new
 * top-level PersistedGameRecord field is introduced, this file MUST be
 * updated.
 *
 * The client sends the full `state` blob; the server derives the summary
 * columns (score / event count / status / etc.) from it. The client never
 * sets `owner_id`, `id`, `started_at`, or the summary columns directly.
 */
import { z } from "zod";

// ─── Enums matching @thestats/core ─────────────────────────────────────

const GameStatusSchema = z.enum([
  "setup",
  "ready",
  "live",
  "timeout",
  "period-break",
  "finished",
]);

const SideSchema = z.enum(["home", "away"]);

const PossessionArrowDirectionSchema = z.enum(["unset", "home", "away"]);

// ─── Sub-shapes (passthrough — trust the core layer for inner details) ─

const TeamSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1, "team name is required"),
    tag: z.string(),
    color: z.string(),
    coach: z.string(),
    roster: z.array(z.unknown()),
  })
  .passthrough();

const GameSettingsSchema = z
  .object({
    format: z.enum(["5v5", "3v3"]),
    periods: z.number().int().positive(),
    periodSeconds: z.number().int().positive(),
    overtimeSeconds: z.number().int().nonnegative(),
    overtimeEnabled: z.boolean(),
    possessionArrowEnabled: z.boolean(),
    bonusFoulThreshold: z.number().int().positive(),
    timeoutsPerGame: z.number().int().nonnegative(),
    timeoutSeconds: z.number().int().nonnegative(),
    quarterBreakSeconds: z.number().int().nonnegative(),
    halftimeBreakSeconds: z.number().int().nonnegative(),
    venue: z.string(),
    competition: z.string(),
  })
  .passthrough();

const OnCourtSchema = z.object({
  home: z.array(z.string()),
  away: z.array(z.string()),
});

// GameEvent is a large discriminated union — we deliberately keep it open
// here (`z.record(z.unknown())`) and let the core layer enforce shape when
// events are consumed. The boundary check is that it's an array of objects.
const EventsSchema = z.array(z.record(z.string(), z.unknown()));

// ─── PersistedGameRecord (top-level strict, sub-fields typed) ──────────

export const PersistedGameRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    homeTeam: TeamSchema,
    awayTeam: TeamSchema,
    settings: GameSettingsSchema,
    status: GameStatusSchema,
    currentPeriod: z.number().int().positive(),
    events: EventsSchema,
    possession: SideSchema.nullable(),
    possessionArrow: PossessionArrowDirectionSchema.optional(),
    onCourt: OnCourtSchema,
  })
  .strict();

export type PersistedGameRecordInput = z.infer<typeof PersistedGameRecordSchema>;

// ─── POST / PATCH bodies ───────────────────────────────────────────────

export const PostGameBodySchema = z
  .object({
    state: PersistedGameRecordSchema,
  })
  .strict();

export const PatchGameBodySchema = PostGameBodySchema;

export type PostGameBodyInput = z.infer<typeof PostGameBodySchema>;
export type PatchGameBodyInput = z.infer<typeof PatchGameBodySchema>;

// ─── GET /api/games query ──────────────────────────────────────────────

/**
 * Query-param parsing. Values arrive as strings from `URLSearchParams`;
 * we coerce `limit` to a number and validate cursor as an ISO datetime.
 */
export const LibraryQuerySchema = z
  .object({
    cursor: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type LibraryQueryInput = z.infer<typeof LibraryQuerySchema>;
