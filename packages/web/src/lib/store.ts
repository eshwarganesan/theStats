"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  FoulKind,
  GameEvent,
  GameSettings,
  GameStatus,
  Player,
  ScoreKind,
  Side,
  StatKind,
  Team,
} from "./types";
import { DEFAULT_SETTINGS, PLAYERS_ON_COURT } from "./constants";
import { uid } from "./utils";

/**
 * Store shape — event-sourced state.
 *
 * The three critical invariants:
 *   1. `events` is append-only during normal play; the only mutation besides
 *      pushing is `undoLastEvent`, which pops.
 *   2. Statistics are NEVER stored — they are always derived from `events` via
 *      `computeStats` in `lib/stats.ts`. This avoids drift.
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
  /** Events in chronological order. */
  events: GameEvent[];
  /** Which team has possession; `null` means not yet determined. */
  possession: Side | null;
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

  // ─── Clock actions ─────────────────────────────────────────────────────
  startClock: () => void;
  stopClock: () => void;
  resetClock: () => void;
  tickClock: (deltaMs: number) => void;
  adjustClock: (seconds: number) => void;

  // ─── Gameplay actions ──────────────────────────────────────────────────
  recordScore: (side: Side, playerId: string, kind: ScoreKind, made: boolean) => void;
  recordFoul: (side: Side, playerId: string, kind: FoulKind) => void;
  recordStat: (side: Side, playerId: string, kind: StatKind) => void;
  recordTimeout: (side: Side) => void;
  substitute: (side: Side, playerOutId: string, playerInId: string) => void;
  togglePossession: (side: Side | null) => void;
  undoLastEvent: () => void;
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

export const useGameStore = create<GameState>()(
  subscribeWithSelector((set, get) => ({
    // ── Initial state ────────────────────────────────────────────────────
    homeTeam: makeBlankTeam("home"),
    awayTeam: makeBlankTeam("away"),
    settings: INITIAL_SETTINGS,
    status: "setup",
    currentPeriod: 1,
    clockSeconds: INITIAL_SETTINGS.periodSeconds,
    clockRunning: false,
    events: [],
    possession: null,
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
        events: [],
        possession: null,
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
      const { currentPeriod, settings } = get();
      const isLastRegular = currentPeriod >= settings.periods;
      set((s) => ({
        status: isLastRegular ? "finished" : "period-break",
        clockRunning: false,
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
      set((s) => ({
        clockSeconds: Math.max(0, Math.min(s.settings.periodSeconds, seconds)),
      })),

    // ── Gameplay ─────────────────────────────────────────────────────────
    recordScore: (side, playerId, kind, made) =>
      set((s) => ({
        events: [
          ...s.events,
          {
            type: "score",
            id: uid(),
            timestamp: Date.now(),
            period: s.currentPeriod,
            clockAt: s.clockSeconds,
            side,
            playerId,
            kind,
            made,
          },
        ],
      })),

    recordFoul: (side, playerId, kind) =>
      set((s) => ({
        events: [
          ...s.events,
          {
            type: "foul",
            id: uid(),
            timestamp: Date.now(),
            period: s.currentPeriod,
            clockAt: s.clockSeconds,
            side,
            playerId,
            kind,
          },
        ],
      })),

    recordStat: (side, playerId, kind) =>
      set((s) => ({
        events: [
          ...s.events,
          {
            type: "stat",
            id: uid(),
            timestamp: Date.now(),
            period: s.currentPeriod,
            clockAt: s.clockSeconds,
            side,
            playerId,
            kind,
          },
        ],
      })),

    recordTimeout: (side) =>
      set((s) => ({
        clockRunning: false,
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
  })),
);
