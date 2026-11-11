/**
 * Write-through save of the signed-in user's game to the games API
 * (feature 009-account-library, Research R-01). Shared by web and iOS.
 *
 * `WriteThroughController` takes the stream of committed game records,
 * debounces it (250 ms by default), POSTs the first record to
 * `/api/games` and PATCHes every later one to `/api/games/[id]`. A record
 * is the whole game, so only the latest pending one matters and any
 * write can be repeated safely.
 *
 * Idempotency (Constitution Principle VI): the POST's key is minted once
 * and reused for every attempt until one succeeds, so a retry after a
 * lost response gets back the row the first attempt created instead of a
 * duplicate. That replayed row (200 rather than 201) holds the earlier
 * attempt's state, so the record is then sent again as a PATCH. PATCHes
 * are full-state writes and each carries a fresh key.
 */
import { shallow } from "zustand/vanilla/shallow";
import type { PersistedGameRecord } from "../persistence";
import { toPersistedGameRecord, type GameState } from "../store";
import { readApiErrorCode } from "../api/errors";
import { newIdempotencyKey } from "./idempotency";

/** Coarse lifecycle of the last write, for surfacing to the UI. */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Sends one request to the games API. `path` is `/api/games` or
 * `/api/games/<id>`: web resolves it against its own origin, iOS against
 * the API origin with the user's bearer token.
 */
export type GamesApiFetch = (path: string, init: RequestInit) => Promise<Response>;

/** Where saving one game stands; enough to resume after an app restart. */
export interface SyncState {
  /** Server id of the game, once a POST has created it. */
  gameId: string | null;
  /** Idempotency key of the POST that creates the game, kept until it succeeds. */
  createKey: string | null;
  /** True while the latest committed record still has to be written:
   *  debouncing, in flight, or failed in a way a retry may fix. */
  unsaved: boolean;
}

/** Exponential backoff for failed writes that may succeed later. */
export interface RetryPolicy {
  initialMs: number;
  maxMs: number;
}

export interface WriteThroughOptions {
  signedIn: boolean;
  debounceMs?: number;
  /** Notified whenever the last write's status changes. */
  onStatus?: (status: SaveStatus) => void;
  /** Defaults to the global `fetch` with same-origin paths (web). */
  fetch?: GamesApiFetch;
  /** Retry failures that may succeed later (network errors, 401, 408,
   *  429, 5xx). Off by default; the next commit retries instead. */
  retry?: RetryPolicy;
  /** Resume saving a game from before an app restart. */
  initialState?: Pick<SyncState, "gameId" | "createKey">;
  /** Notified whenever `SyncState` changes, so a platform can persist it. */
  onSyncStateChange?: (state: SyncState) => void;
  /**
   * Notified once when the API answers `401 account_deleted`: the account
   * is gone, so the controller stops for good instead of retrying, and
   * unsent changes are dropped (feature 018, FR-009).
   */
  onAccountGone?: () => void;
}

function isRetryable(status: number): boolean {
  return status === 401 || status === 408 || status === 429 || status >= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readGameId(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const game = isRecord(body) ? body.game : undefined;
    return isRecord(game) && typeof game.id === "string" ? game.id : null;
  } catch {
    return null;
  }
}

export class WriteThroughController {
  private readonly signedIn: boolean;
  private readonly debounceMs: number;
  private readonly onStatus?: (status: SaveStatus) => void;
  private readonly request: GamesApiFetch;
  private readonly retry: RetryPolicy | null;
  private readonly onSyncStateChange?: (state: SyncState) => void;
  private readonly onAccountGone?: () => void;
  private sync: SyncState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: PersistedGameRecord | null = null;
  private draining: Promise<void> | null = null;
  private failures = 0;
  /** Bumped when the controller switches games or is disposed, so a
   *  write still in flight can't apply its result to the next game. */
  private epoch = 0;
  private disposed = false;

  constructor(opts: WriteThroughOptions) {
    this.signedIn = opts.signedIn;
    this.debounceMs = opts.debounceMs ?? 250;
    this.onStatus = opts.onStatus;
    this.request = opts.fetch ?? ((path, init) => fetch(path, init));
    this.retry = opts.retry ?? null;
    this.onSyncStateChange = opts.onSyncStateChange;
    this.onAccountGone = opts.onAccountGone;
    this.sync = {
      gameId: opts.initialState?.gameId ?? null,
      createKey: opts.initialState?.createKey ?? null,
      unsaved: false,
    };
  }

  /**
   * Record a fresh committed record. Coalesced with any earlier commits
   * still inside the debounce window; only the latest record is sent.
   */
  onCommit(record: PersistedGameRecord): void {
    if (!this.accept(record)) return;
    this.schedule(this.debounceMs);
  }

  /**
   * Persist `record` now, bypassing the debounce window (the manual
   * "Save" button). Resolves once the write settles; the outcome is
   * reported through `onStatus`.
   */
  async saveNow(record: PersistedGameRecord): Promise<void> {
    if (!this.accept(record)) return;
    await this.flush();
  }

  /**
   * Send the pending record now instead of waiting for the debounce or
   * a retry. Resolves when nothing is left to send or a write fails;
   * calls made while writing join the same run, so writes for one game
   * never race.
   */
  flush(): Promise<void> {
    this.clearTimer();
    this.draining ??= this.drain().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  /** The id of the server row being written, once known. */
  currentGameId(): string | null {
    return this.sync.gameId;
  }

  getSyncState(): SyncState {
    return this.sync;
  }

  /**
   * Switch to another game: an existing row opened from the library, or
   * `null` for a new game, which gets its own POST key. Unsent changes of
   * the previous game are dropped (the caller is replacing the local
   * game), and a write already in flight no longer updates the
   * controller.
   */
  setGameId(id: string | null): void {
    this.epoch++;
    this.clearTimer();
    this.pending = null;
    this.failures = 0;
    this.setSync({ gameId: id, createKey: null, unsaved: false });
  }

  /** Stop for good: cancel timers and drop unsent changes. */
  dispose(): void {
    this.disposed = true;
    this.epoch++;
    this.clearTimer();
    this.pending = null;
  }

  private accept(record: PersistedGameRecord): boolean {
    if (!this.signedIn || this.disposed) return false;
    this.pending = record;
    this.setSync({ unsaved: true });
    return true;
  }

  private async drain(): Promise<void> {
    while (this.pending && this.signedIn && !this.disposed) {
      const record = this.pending;
      this.pending = null;
      if (!(await this.write(record))) return;
    }
  }

  /** One attempt. Returns false when the write failed. */
  private async write(record: PersistedGameRecord): Promise<boolean> {
    const epoch = this.epoch;
    const { gameId } = this.sync;
    let key: string;
    if (gameId === null) {
      key = this.sync.createKey ?? newIdempotencyKey();
      // Persisted before sending, so a restart retries with the same key.
      this.setSync({ createKey: key });
    } else {
      key = newIdempotencyKey();
    }

    this.setStatus("saving");
    let response: Response;
    try {
      response = await this.request(gameId === null ? "/api/games" : `/api/games/${gameId}`, {
        method: gameId === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ state: record }),
      });
    } catch {
      return this.failed(epoch, record, true);
    }
    if (response.status === 401 && (await readApiErrorCode(response)) === "account_deleted") {
      this.accountGone();
      return false;
    }
    if (!response.ok) return this.failed(epoch, record, isRetryable(response.status));

    const createdId = gameId === null ? await readGameId(response) : null;
    if (epoch !== this.epoch) return true;
    if (gameId === null) {
      if (createdId === null) return this.failed(epoch, record, true);
      this.setSync({ gameId: createdId, createKey: null });
      if (response.status === 200) this.pending ??= record;
    }

    this.failures = 0;
    if (this.pending === null) {
      this.setSync({ unsaved: false });
      this.setStatus("saved");
    }
    return true;
  }

  /** The account no longer exists: nothing will ever be accepted again. */
  private accountGone(): void {
    if (this.disposed) return;
    this.dispose();
    this.onAccountGone?.();
  }

  private failed(epoch: number, record: PersistedGameRecord, retryable: boolean): boolean {
    // The write belonged to a game the controller has moved on from;
    // keep draining whatever is pending for the current one.
    if (epoch !== this.epoch) return true;
    this.setStatus("error");
    if (retryable) {
      this.pending ??= record;
      if (this.retry) {
        const { initialMs, maxMs } = this.retry;
        this.schedule(Math.min(maxMs, initialMs * 2 ** this.failures));
      }
      this.failures++;
    } else if (this.pending === null) {
      // The server will never accept this record; resending can't help.
      this.setSync({ unsaved: false });
    }
    return false;
  }

  private setSync(next: Partial<SyncState>): void {
    const merged = { ...this.sync, ...next };
    if (shallow(merged, this.sync)) return;
    this.sync = merged;
    this.onSyncStateChange?.(merged);
  }

  private setStatus(status: SaveStatus): void {
    this.onStatus?.(status);
  }

  private schedule(ms: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/** The store surface write-through needs; both game store flavors have it. */
export interface GameRecordSource {
  subscribe<U>(
    selector: (state: GameState) => U,
    listener: (selected: U, previous: U) => void,
    options?: { equalityFn?: (a: U, b: U) => boolean; fireImmediately?: boolean },
  ): () => void;
}

/**
 * Calls `listener` with the game's persisted record whenever one of its
 * fields changes. Clock ticks only change `clockSeconds` and
 * `breakSeconds`, which aren't part of the record, so a running clock
 * neither fires it nor keeps resetting the debounce.
 */
export function subscribeToGameRecord(
  store: GameRecordSource,
  listener: (record: PersistedGameRecord) => void,
): () => void {
  return store.subscribe(toPersistedGameRecord, (record) => listener(record), {
    equalityFn: shallow,
  });
}
