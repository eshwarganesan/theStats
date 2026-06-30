"use client";

import { create, type StateCreator } from "zustand";
import {
  createJSONStorage,
  persist,
  subscribeWithSelector,
} from "zustand/middleware";
import type {
  EditEventPatch,
  FoulKind,
  GameEvent,
  GameSettings,
  GameStatus,
  Player,
  PossessionArrowDirection,
  ScoreKind,
  Side,
  StatKind,
  Team,
} from "@thestats/core";
import {
  DEFAULT_SETTINGS,
  PLAYERS_ON_COURT,
  computeStats,
  uid,
} from "@thestats/core";
import {
  GAME_STORAGE_KEY,
  clearPersistedGame,
  createGuardedLocalStorage,
  createNoopStorage,
  isStorageAvailable,
  notifyRecoveryFailed,
  parseGameRecord,
  readClockCheckpoint,
  type PersistedGameRecord,
} from "./persistence";

/**
 * Store shape — event-sourced state.
 *
 * The three critical invariants:
 *   1. `events` has exactly four explicit mutations: append (via every `record*`
 *      action plus `startGame`/`endPeriod`/`startNextPeriod`/clock actions),
 *      `editEvent` (in-place patch of an existing event's editable fields),
 *      `deleteEvent` (remove a recorded score/foul/stat/timeout by id), and
 *      `undoLastEvent` (pop the tail). No other action mutates the events array.
 *   2. Statistics are NEVER stored — they are always derived from `events` via
 *      `computeStats` in `lib/stats.ts`. This avoids drift. `editEvent` and
 *      `deleteEvent` preserve this invariant trivially: subscribers re-fire,
 *      `computeStats` re-folds.
 *   3. On-court lineups are also derived by replaying `substitution` events
 *      over the initial starters, so `playersOnCourt` is a *cache*, not truth.
 */
interface GameState {
  // ─── Setup ─────────────────────────────────────────────────────────────
  homeTeam: Team;
  awayTeam: Team;
  settings: GameSettings;

  // ─── Live state ────────────────────────────────────────────────────────
  status: GameStatus;
  currentPeriod: number;
  /** Remaining seconds in the current period. */
  clockSeconds: number;
  /** Whether the clock is running. */
  clockRunning: boolean;
  /** Remaining seconds on the active timeout or period-break countdown.
   *  `0` when no break is active. Mutated only by tickClock, adjustClock,
   *  recordTimeout, endPeriod, startNextPeriod, and endTimeout. */
  breakSeconds: number;
  /** Events in chronological order. */
  events: GameEvent[];
  /** Which team has possession; `null` means not yet determined. */
  possession: Side | null;
  /** Direction of the alternating-possession arrow (feature 007). Initializes
   *  to `'unset'` for every new game; mutates only via `cyclePossessionArrow`
   *  per FR-006. Only meaningful when `settings.possessionArrowEnabled` is
   *  `true`; when the toggle is off, this field is still present (always
   *  `'unset'`) but is never read by any view. */
  possessionArrow: PossessionArrowDirection;
  /** IDs currently on the floor, per side. */
  onCourt: { home: string[]; away: string[] };

  // ─── Setup actions ─────────────────────────────────────────────────────
  setTeam: (side: Side, team: Partial<Team>) => void;
  addPlayer: (side: Side, player: Omit<Player, "id">) => void;
  updatePlayer: (side: Side, playerId: string, data: Partial<Player>) => void;
  removePlayer: (side: Side, playerId: string) => void;
  setSettings: (settings: Partial<GameSettings>) => void;
  resetAll: () => void;

  // ─── Game lifecycle ────────────────────────────────────────────────────
  /** Lock setup and move to `ready`. Validates line-ups. */
  prepareGame: () => { ok: true } | { ok: false; reason: string };
  /** Tip-off: move from `ready` to `live`. */
  startGame: () => void;
  endPeriod: () => void;
  startNextPeriod: () => void;
  finishGame: () => void;
  /** End the active timeout and return to `live`. No-op when status !== "timeout". */
  endTimeout: () => void;

  // ─── Clock actions ─────────────────────────────────────────────────────
  startClock: () => void;
  stopClock: () => void;
  resetClock: () => void;
  tickClock: (deltaMs: number) => void;
  adjustClock: (seconds: number) => void;

  // ─── Gameplay actions ──────────────────────────────────────────────────
  /** `clockAt`, when provided, overrides the live `clockSeconds` reading
   *  for this event. The UI captures it at the moment the scorekeeper taps
   *  a player, so the recorded play time reflects when the action *happened*
   *  rather than when the action modal was finally submitted. Omit for
   *  callers that genuinely want "now" semantics (tests, seed scripts). */
  recordScore: (
    side: Side,
    playerId: string,
    kind: ScoreKind,
    made: boolean,
    clockAt?: number,
  ) => void;
  recordFoul: (
    side: Side,
    playerId: string,
    kind: FoulKind,
    clockAt?: number,
  ) => void;
  recordStat: (
    side: Side,
    playerId: string,
    kind: StatKind,
    clockAt?: number,
  ) => void;
  recordTimeout: (side: Side) => void;
  substitute: (side: Side, playerOutId: string, playerInId: string) => void;
  togglePossession: (side: Side | null) => void;
  /** Set the alternating-possession arrow to the given side (feature 007,
   *  FR-006). When the current direction already equals `side`, the call
   *  is a no-op. The action mutates only `possessionArrow`. There is no
   *  path back to `'unset'` through this action — that state is reachable
   *  only via `resetAll` / `prepareGame`. */
  setPossessionArrow: (side: Side) => void;
  undoLastEvent: () => void;

  // ─── Play-by-play corrections ──────────────────────────────────────────
  /** Patch an existing event in place. The patch's `type` discriminant
   *  must match the event's `type`; mismatch is a no-op. Validation
   *  rejects bad patches silently (dev-only console.warn). See
   *  `specs/004-edit-play-events/contracts/store-api.md`. */
  editEvent: (id: string, patch: EditEventPatch) => void;
  /** Remove an event from the events array by id. Restricted to
   *  `score | foul | stat | timeout` types; any other type is a no-op. */
  deleteEvent: (id: string) => void;
}

// ─── Defaults ─────────────────────────────────────────────────────────────

function makeBlankTeam(side: Side): Team {
  return {
    id: uid(),
    name: side === "home" ? "Home Team" : "Away Team",
    tag: side === "home" ? "HME" : "AWY",
    color: side === "home" ? "#3B82F6" : "#EF4444",
    coach: "",
    roster: [],
  };
}

const INITIAL_SETTINGS = DEFAULT_SETTINGS["5v5"];

// ─── Store ────────────────────────────────────────────────────────────────

/**
 * The store reducer body — a Zustand `StateCreator`-shaped function
 * shared between the unwrapped factory (used by unit tests) and the
 * persist-wrapped exported store (used by the app). Both stores see
 * their own bound `set`/`get`, so actions close over the correct
 * instance.
 */
const storeBody: StateCreator<
  GameState,
  [["zustand/subscribeWithSelector", never]],
  []
> = (set, get) => ({
    // ── Initial state ────────────────────────────────────────────────────
    homeTeam: makeBlankTeam("home"),
    awayTeam: makeBlankTeam("away"),
    settings: INITIAL_SETTINGS,
    status: "setup",
    currentPeriod: 1,
    clockSeconds: INITIAL_SETTINGS.periodSeconds,
    clockRunning: false,
    breakSeconds: 0,
    events: [],
    possession: null,
    possessionArrow: "unset",
    onCourt: { home: [], away: [] },

    // ── Setup ────────────────────────────────────────────────────────────
    setTeam: (side, team) =>
      set((s) => ({
        [side === "home" ? "homeTeam" : "awayTeam"]: {
          ...s[side === "home" ? "homeTeam" : "awayTeam"],
          ...team,
        },
      })),

    addPlayer: (side, player) =>
      set((s) => {
        const key = side === "home" ? "homeTeam" : "awayTeam";
        return {
          [key]: {
            ...s[key],
            roster: [...s[key].roster, { ...player, id: uid() }],
          },
        };
      }),

    updatePlayer: (side, playerId, data) =>
      set((s) => {
        const key = side === "home" ? "homeTeam" : "awayTeam";
        return {
          [key]: {
            ...s[key],
            roster: s[key].roster.map((p) =>
              p.id === playerId ? { ...p, ...data } : p,
            ),
          },
        };
      }),

    removePlayer: (side, playerId) =>
      set((s) => {
        const key = side === "home" ? "homeTeam" : "awayTeam";
        return {
          [key]: {
            ...s[key],
            roster: s[key].roster.filter((p) => p.id !== playerId),
          },
        };
      }),

    setSettings: (settings) =>
      set((s) => {
        const next = { ...s.settings, ...settings };
        // If the format changed, cascade default-derived values so the UI is
        // consistent (e.g. switching 5v5 ↔ 3v3 swaps period length/count).
        if (settings.format && settings.format !== s.settings.format) {
          const base = DEFAULT_SETTINGS[settings.format];
          return {
            settings: { ...base, venue: next.venue, competition: next.competition },
            clockSeconds: base.periodSeconds,
          };
        }
        return {
          settings: next,
          // If the user changed period length pre-game, reflect it.
          clockSeconds: s.status === "setup" ? next.periodSeconds : s.clockSeconds,
        };
      }),

    resetAll: () =>
      set(() => ({
        homeTeam: makeBlankTeam("home"),
        awayTeam: makeBlankTeam("away"),
        settings: DEFAULT_SETTINGS["5v5"],
        status: "setup",
        currentPeriod: 1,
        clockSeconds: DEFAULT_SETTINGS["5v5"].periodSeconds,
        clockRunning: false,
        breakSeconds: 0,
        events: [],
        possession: null,
        possessionArrow: "unset",
        onCourt: { home: [], away: [] },
      })),

    // ── Lifecycle ────────────────────────────────────────────────────────
    prepareGame: () => {
      const { homeTeam, awayTeam, settings } = get();
      const onCourtTarget = PLAYERS_ON_COURT[settings.format];

      for (const team of [homeTeam, awayTeam]) {
        if (team.roster.length < onCourtTarget) {
          return {
            ok: false,
            reason: `${team.name} needs at least ${onCourtTarget} players.`,
          };
        }
        const starters = team.roster.filter((p) => p.isStarter);
        if (starters.length !== onCourtTarget) {
          return {
            ok: false,
            reason: `${team.name} must have exactly ${onCourtTarget} starters selected.`,
          };
        }
        const numbers = new Set(team.roster.map((p) => p.number));
        if (numbers.size !== team.roster.length) {
          return {
            ok: false,
            reason: `${team.name} has duplicate jersey numbers.`,
          };
        }
      }

      set({
        status: "ready",
        onCourt: {
          home: homeTeam.roster.filter((p) => p.isStarter).map((p) => p.id),
          away: awayTeam.roster.filter((p) => p.isStarter).map((p) => p.id),
        },
        clockSeconds: settings.periodSeconds,
        currentPeriod: 1,
        events: [],
        possessionArrow: "unset",
      });
      return { ok: true };
    },

    startGame: () => {
      set((s) => ({
        status: "live",
        events: [
          ...s.events,
          {
            type: "period",
            id: uid(),
            timestamp: Date.now(),
            period: s.currentPeriod,
            clockAt: s.clockSeconds,
            action: "start",
          },
        ],
      }));
    },

    endPeriod: () => {
      const { currentPeriod, settings, events, homeTeam, awayTeam } = get();
      const isLastRegular = currentPeriod >= settings.periods;
      // Halftime applies between adjacent regulation periods that straddle
      // the half boundary. For a 4-period game this is between p2 and p3;
      // generalises to settings.periods/2 for any even period count.
      const isHalfBoundary =
        !isLastRegular &&
        settings.periods % 2 === 0 &&
        currentPeriod === settings.periods / 2;
      // Overtime trigger (feature 003): when the final regulation OR any
      // overtime period ends with a tied score AND overtime is enabled, the
      // game routes into a break instead of finalizing. OT-boundary breaks
      // are never halftime, so they always seed with quarterBreakSeconds.
      const otGate = settings.overtimeEnabled && settings.overtimeSeconds > 0;
      const stats = computeStats(events, homeTeam, awayTeam, settings, currentPeriod);
      const isTied = stats.home.points === stats.away.points;
      const goToBreak = !isLastRegular || (otGate && isTied);
      const nextStatus: GameStatus = goToBreak ? "period-break" : "finished";
      const seededBreakSeconds = !goToBreak
        ? 0
        : isHalfBoundary
          ? settings.halftimeBreakSeconds
          : settings.quarterBreakSeconds;
      set((s) => ({
        status: nextStatus,
        clockRunning: false,
        breakSeconds: seededBreakSeconds,
        events: [
          ...s.events,
          {
            type: "period",
            id: uid(),
            timestamp: Date.now(),
            period: s.currentPeriod,
            clockAt: s.clockSeconds,
            action: "end",
          },
        ],
      }));
    },

    startNextPeriod: () => {
      const { currentPeriod, settings } = get();
      const isOT = currentPeriod >= settings.periods;
      const nextPeriod = currentPeriod + 1;
      const nextLength = isOT ? settings.overtimeSeconds : settings.periodSeconds;
      set((s) => ({
        currentPeriod: nextPeriod,
        clockSeconds: nextLength,
        status: "live",
        breakSeconds: 0,
        events: [
          ...s.events,
          {
            type: "period",
            id: uid(),
            timestamp: Date.now(),
            period: nextPeriod,
            clockAt: nextLength,
            action: "start",
          },
        ],
      }));
    },

    finishGame: () => set({ status: "finished", clockRunning: false }),

    endTimeout: () =>
      set((s) =>
        s.status === "timeout"
          ? { status: "live", breakSeconds: 0 }
          : s,
      ),

    // ── Clock ────────────────────────────────────────────────────────────
    startClock: () =>
      set((s) => {
        if (s.status !== "live" || s.clockSeconds <= 0) return s;
        return {
          clockRunning: true,
          events: [
            ...s.events,
            {
              type: "clock",
              id: uid(),
              timestamp: Date.now(),
              period: s.currentPeriod,
              clockAt: s.clockSeconds,
              action: "start",
            },
          ],
        };
      }),

    stopClock: () =>
      set((s) => {
        if (!s.clockRunning) return s;
        return {
          clockRunning: false,
          events: [
            ...s.events,
            {
              type: "clock",
              id: uid(),
              timestamp: Date.now(),
              period: s.currentPeriod,
              clockAt: s.clockSeconds,
              action: "stop",
            },
          ],
        };
      }),

    resetClock: () =>
      set((s) => ({
        clockSeconds:
          s.currentPeriod > s.settings.periods
            ? s.settings.overtimeSeconds
            : s.settings.periodSeconds,
        clockRunning: false,
      })),

    tickClock: (deltaMs) =>
      set((s) => {
        // Break states own a separate countdown (breakSeconds). When the
        // game is in a timeout or between-period break, drive that one
        // instead of the live game clock.
        if (s.status === "timeout" || s.status === "period-break") {
          const next = Math.max(0, s.breakSeconds - deltaMs / 1000);
          return { breakSeconds: next };
        }
        if (!s.clockRunning) return s;
        const next = Math.max(0, s.clockSeconds - deltaMs / 1000);
        if (next <= 0) {
          // Buzzer: stop clock, but leave `status` to the caller. The UI
          // will surface an "End period" CTA.
          return { clockSeconds: 0, clockRunning: false };
        }
        return { clockSeconds: next };
      }),

    adjustClock: (seconds) =>
      set((s) => {
        // Break-state adjust mutates breakSeconds with a generous cap and
        // does not emit any event (per spec clarification — breaks are
        // transient UI/state and not recorded in the event log).
        if (s.status === "timeout" || s.status === "period-break") {
          const BREAK_MAX = 30 * 60;
          const to = Math.max(0, Math.min(BREAK_MAX, seconds));
          return { breakSeconds: to };
        }
        if (s.status !== "live") return s;
        if (s.clockRunning) return s;

        const max =
          s.currentPeriod > s.settings.periods
            ? s.settings.overtimeSeconds
            : s.settings.periodSeconds;
        const from = s.clockSeconds;
        const to = Math.max(0, Math.min(max, seconds));

        if (to === from) return s;

        // Coalesce with the immediately-prior adjust event when this call
        // continues a session — same period, prior `to` matches current
        // `from`, and we are within the SC-006 1500 ms window. This collapses
        // rapid nudge sequences into a single play-by-play entry.
        const COALESCE_WINDOW_MS = 1500;
        const last = s.events.at(-1);
        const now = Date.now();
        if (
          last &&
          last.type === "clock" &&
          last.action === "adjust" &&
          last.period === s.currentPeriod &&
          last.to === from &&
          now - last.timestamp <= COALESCE_WINDOW_MS
        ) {
          // Net no-op session (came back to where we started) — drop the
          // event so the log doesn't keep a phantom from===to entry.
          if (last.from === to) {
            return {
              clockSeconds: to,
              events: s.events.slice(0, -1),
            };
          }
          const merged: GameEvent = {
            type: "clock",
            id: last.id,
            timestamp: now,
            period: last.period,
            clockAt: last.from,
            action: "adjust",
            from: last.from,
            to,
          };
          return {
            clockSeconds: to,
            events: [...s.events.slice(0, -1), merged],
          };
        }

        return {
          clockSeconds: to,
          events: [
            ...s.events,
            {
              type: "clock",
              id: uid(),
              timestamp: now,
              period: s.currentPeriod,
              clockAt: from,
              action: "adjust",
              from,
              to,
            },
          ],
        };
      }),

    // ── Gameplay ─────────────────────────────────────────────────────────
    recordScore: (side, playerId, kind, made, clockAt) =>
      set((s) => ({
        events: [
          ...s.events,
          {
            type: "score",
            id: uid(),
            timestamp: Date.now(),
            period: s.currentPeriod,
            clockAt: clockAt ?? s.clockSeconds,
            side,
            playerId,
            kind,
            made,
          },
        ],
      })),

    recordFoul: (side, playerId, kind, clockAt) =>
      set((s) => ({
        events: [
          ...s.events,
          {
            type: "foul",
            id: uid(),
            timestamp: Date.now(),
            period: s.currentPeriod,
            clockAt: clockAt ?? s.clockSeconds,
            side,
            playerId,
            kind,
          },
        ],
      })),

    recordStat: (side, playerId, kind, clockAt) =>
      set((s) => ({
        events: [
          ...s.events,
          {
            type: "stat",
            id: uid(),
            timestamp: Date.now(),
            period: s.currentPeriod,
            clockAt: clockAt ?? s.clockSeconds,
            side,
            playerId,
            kind,
          },
        ],
      })),

    recordTimeout: (side) =>
      set((s) => ({
        status: "timeout",
        clockRunning: false,
        breakSeconds: s.settings.timeoutSeconds,
        events: [
          ...s.events,
          {
            type: "timeout",
            id: uid(),
            timestamp: Date.now(),
            period: s.currentPeriod,
            clockAt: s.clockSeconds,
            side,
          },
        ],
      })),

    substitute: (side, playerOutId, playerInId) =>
      set((s) => {
        const court = s.onCourt[side];
        if (!court.includes(playerOutId) || court.includes(playerInId)) return s;
        const nextCourt = court.map((id) => (id === playerOutId ? playerInId : id));
        return {
          onCourt: { ...s.onCourt, [side]: nextCourt },
          events: [
            ...s.events,
            {
              type: "substitution",
              id: uid(),
              timestamp: Date.now(),
              period: s.currentPeriod,
              clockAt: s.clockSeconds,
              side,
              playerInId,
              playerOutId,
            },
          ],
        };
      }),

    togglePossession: (side) => set({ possession: side }),

    setPossessionArrow: (side) =>
      set((s) =>
        s.possessionArrow === side ? s : { possessionArrow: side },
      ),

    undoLastEvent: () =>
      set((s) => {
        if (s.events.length === 0) return s;
        const last = s.events[s.events.length - 1]!;
        const nextEvents = s.events.slice(0, -1);
        // If the last event was a substitution, revert on-court state.
        if (last.type === "substitution") {
          const court = s.onCourt[last.side];
          const reverted = court.map((id) =>
            id === last.playerInId ? last.playerOutId : id,
          );
          return {
            events: nextEvents,
            onCourt: { ...s.onCourt, [last.side]: reverted },
          };
        }
        return { events: nextEvents };
      }),

    // ── Play-by-play corrections ─────────────────────────────────────────
    editEvent: (id, patch) =>
      set((s) => {
        const idx = s.events.findIndex((e) => e.id === id);
        if (idx < 0) return s;
        const existing = s.events[idx]!;
        // Type discriminant must match — protects against stale patches and
        // (statically impossible) calls against unsupported event types.
        if (existing.type !== patch.type) return s;

        // Resolve the post-edit side. Whichever the caller did NOT touch,
        // retain from `existing`.
        const nextSide = patch.side ?? existing.side;

        // For player-bearing event types, resolve the post-edit playerId
        // (caller's override OR the existing event's playerId) and verify
        // the player exists on the post-edit side's current roster.
        if (
          existing.type === "score" ||
          existing.type === "foul" ||
          existing.type === "stat"
        ) {
          const patchPlayerId =
            "playerId" in patch ? patch.playerId : undefined;
          const nextPlayerId = patchPlayerId ?? existing.playerId;
          const roster =
            nextSide === "home" ? s.homeTeam.roster : s.awayTeam.roster;
          if (!roster.some((p) => p.id === nextPlayerId)) return s;
        }

        // clockAt, when provided, must be within [0, periodLength] for the
        // event's period.
        if (patch.clockAt !== undefined) {
          const periodLength =
            existing.period > s.settings.periods
              ? s.settings.overtimeSeconds
              : s.settings.periodSeconds;
          if (patch.clockAt < 0 || patch.clockAt > periodLength) return s;
        }

        // Build the patched event, preserving identity fields (id, type,
        // period, timestamp) and applying only the editable-field overrides.
        const merged = ((): GameEvent => {
          if (existing.type === "score" && patch.type === "score") {
            return {
              ...existing,
              ...(patch.clockAt !== undefined ? { clockAt: patch.clockAt } : {}),
              side: nextSide,
              ...(patch.playerId !== undefined
                ? { playerId: patch.playerId }
                : {}),
              ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
              ...(patch.made !== undefined ? { made: patch.made } : {}),
            };
          }
          if (existing.type === "foul" && patch.type === "foul") {
            return {
              ...existing,
              ...(patch.clockAt !== undefined ? { clockAt: patch.clockAt } : {}),
              side: nextSide,
              ...(patch.playerId !== undefined
                ? { playerId: patch.playerId }
                : {}),
              ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
            };
          }
          if (existing.type === "stat" && patch.type === "stat") {
            return {
              ...existing,
              ...(patch.clockAt !== undefined ? { clockAt: patch.clockAt } : {}),
              side: nextSide,
              ...(patch.playerId !== undefined
                ? { playerId: patch.playerId }
                : {}),
              ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
            };
          }
          // timeout
          return {
            ...existing,
            ...(patch.clockAt !== undefined ? { clockAt: patch.clockAt } : {}),
            side: nextSide,
          };
        })();

        const nextEvents = s.events.slice();
        nextEvents[idx] = merged;
        return { events: nextEvents };
      }),

    deleteEvent: (id) =>
      set((s) => {
        const existing = s.events.find((e) => e.id === id);
        if (!existing) return s;
        if (
          existing.type !== "score" &&
          existing.type !== "foul" &&
          existing.type !== "stat" &&
          existing.type !== "timeout"
        ) {
          return s;
        }
        return { events: s.events.filter((e) => e.id !== id) };
      }),
});

/**
 * Unwrapped store factory — used by unit tests that need to exercise
 * the reducer without touching `localStorage`. The exported
 * `useGameStore` below wraps the same body with `persist`.
 */
export const createGameStore = () =>
  create<GameState>()(subscribeWithSelector(storeBody));

// ─── Persistence wrapping ─────────────────────────────────────────────

export const useGameStore = create<GameState>()(
  persist(subscribeWithSelector(storeBody), {
    name: GAME_STORAGE_KEY,
    version: 1,
    storage: createJSONStorage<PersistedGameRecord>(() =>
      isStorageAvailable() ? createGuardedLocalStorage() : createNoopStorage(),
    ),
    partialize: (state): PersistedGameRecord => ({
      schemaVersion: 1,
      homeTeam: state.homeTeam,
      awayTeam: state.awayTeam,
      settings: state.settings,
      status: state.status,
      currentPeriod: state.currentPeriod,
      events: state.events,
      possession: state.possession,
      possessionArrow: state.possessionArrow,
      onCourt: state.onCourt,
    }),
    merge: (persisted, current) => {
      const parsed = parseGameRecord(persisted);
      if (!parsed) {
        clearPersistedGame();
        notifyRecoveryFailed();
        return current;
      }
      const checkpoint = readClockCheckpoint();
      return {
        ...current,
        homeTeam: parsed.homeTeam,
        awayTeam: parsed.awayTeam,
        settings: parsed.settings,
        status: parsed.status,
        currentPeriod: parsed.currentPeriod,
        events: parsed.events,
        possession: parsed.possession,
        // Older records (pre-feature 007) lack possessionArrow — fall
        // back to the FR-010 default of 'unset' rather than letting an
        // undefined value leak through.
        possessionArrow: parsed.possessionArrow ?? "unset",
        onCourt: parsed.onCourt,
        clockSeconds: checkpoint?.clockSeconds ?? parsed.settings.periodSeconds,
        breakSeconds: checkpoint?.breakSeconds ?? 0,
        clockRunning: false,
      };
    },
    onRehydrateStorage: () => (state) => {
      if (state && state.clockRunning) {
        state.clockRunning = false;
      }
    },
  }),
);

