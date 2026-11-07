import type { LibraryEntry } from "@thestats/app";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { listGames } from "@/lib/games";

type Request = "first" | "refresh" | "more";

interface LibraryState {
  entries: LibraryEntry[];
  nextCursor: string | null;
  /** True once a page has loaded, so an empty list means an empty library. */
  loaded: boolean;
  pending: Request | null;
  /** The request that last failed, so "Try again" repeats it. */
  failed: { request: Request; message: string } | null;
}

const INITIAL: LibraryState = {
  entries: [],
  nextCursor: null,
  loaded: false,
  pending: "first",
  failed: null,
};

const INK_DIM = "#737373";

/**
 * The signed-in user's saved games (GET /api/games), most recent first,
 * like web's library: pull to refresh, and the next page loads as the
 * list nears its end. `header` scrolls with the list, above it.
 *
 * With `onOpen`, tapping a game opens it; with `onDelete`, long-pressing
 * it (or VoiceOver's Delete action) deletes it, and once that resolves
 * true the game leaves the list. Changing `refreshKey` reloads the list.
 */
export function GameLibrary({
  header,
  onOpen,
  onDelete,
  openingId = null,
  refreshKey = 0,
}: {
  header?: ReactElement;
  onOpen?: (entry: LibraryEntry) => void;
  onDelete?: (entry: LibraryEntry) => Promise<boolean>;
  /** The game being opened, which shows a spinner. */
  openingId?: string | null;
  refreshKey?: number;
}) {
  const [state, setState] = useState<LibraryState>(INITIAL);
  const mounted = useRef(true);
  const busy = useRef(false);
  const loadedKey = useRef(refreshKey);

  const load = useCallback(async (request: Request, cursor: string | null) => {
    if (busy.current) return;
    busy.current = true;
    setState((s) => ({ ...s, pending: request, failed: null }));
    const result = await listGames(cursor);
    busy.current = false;
    if (!mounted.current) return;
    setState((s) =>
      result.ok
        ? {
            entries:
              request === "more" ? [...s.entries, ...result.page.entries] : result.page.entries,
            nextCursor: result.page.nextCursor,
            loaded: true,
            pending: null,
            failed: null,
          }
        : { ...s, pending: null, failed: { request, message: result.message } },
    );
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load("first", null);
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (refreshKey === loadedKey.current) return;
    loadedKey.current = refreshKey;
    void load("refresh", null);
  }, [refreshKey, load]);

  const remove = useCallback(
    async (entry: LibraryEntry) => {
      if (!onDelete || !(await onDelete(entry)) || !mounted.current) return;
      setState((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== entry.id) }));
    },
    [onDelete],
  );

  const { entries, nextCursor, loaded, pending, failed } = state;
  const retry = () =>
    void load(failed?.request ?? "first", failed?.request === "more" ? nextCursor : null);

  return (
    <FlatList
      testID="game-library"
      data={entries}
      keyExtractor={(entry) => entry.id}
      renderItem={({ item }) => (
        <LibraryRow
          entry={item}
          opening={openingId === item.id}
          onOpen={onOpen}
          onDelete={onDelete ? remove : undefined}
        />
      )}
      ItemSeparatorComponent={Separator}
      contentContainerClassName="w-full max-w-2xl self-center px-6 pb-10"
      ListHeaderComponent={
        <>
          {header}
          <View className="mb-3 flex-row items-baseline justify-between">
            <Text accessibilityRole="header" className="text-xl font-bold text-ink">
              Games
            </Text>
            {loaded && entries.length > 0 ? (
              <Text className="text-xs text-ink-dim">
                {entries.length} {entries.length === 1 ? "game" : "games"}
              </Text>
            ) : null}
          </View>
        </>
      }
      ListEmptyComponent={
        pending === "first" ? (
          <ActivityIndicator accessibilityLabel="Loading your games" color={INK_DIM} />
        ) : failed && !loaded ? (
          <LoadError message={failed.message} onRetry={retry} />
        ) : (
          <View className="items-center gap-2 rounded-xl border border-surface-border bg-surface-elevated p-6">
            <Text className="text-lg font-bold text-ink">Your library is empty</Text>
            <Text className="text-center text-sm text-ink-dim">
              Games you play will appear here as you score them — so you can pick them back up on
              any device.
            </Text>
          </View>
        )
      }
      ListFooterComponent={
        entries.length === 0 ? undefined : pending === "more" ? (
          <ActivityIndicator
            accessibilityLabel="Loading more games"
            color={INK_DIM}
            className="py-4"
          />
        ) : failed ? (
          <LoadError message={failed.message} onRetry={retry} />
        ) : undefined
      }
      onEndReached={() => {
        if (nextCursor && !failed) void load("more", nextCursor);
      }}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={pending === "refresh"}
          onRefresh={() => void load("refresh", null)}
          tintColor={INK_DIM}
        />
      }
    />
  );
}

function Separator() {
  return <View className="h-2" />;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="items-center gap-3 py-4">
      <Text className="text-center text-sm text-danger">{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="rounded-lg border border-surface-border px-4 py-2"
      >
        <Text className="text-sm text-ink">Try again</Text>
      </Pressable>
    </View>
  );
}

function formatStartedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function LibraryRow({
  entry,
  opening,
  onOpen,
  onDelete,
}: {
  entry: LibraryEntry;
  opening: boolean;
  onOpen?: (entry: LibraryEntry) => void;
  onDelete?: (entry: LibraryEntry) => Promise<void>;
}) {
  const finished = entry.status === "finished";
  const statusLabel = finished ? "Final" : "In progress";
  const startedAt = formatStartedAt(entry.startedAt);
  const label = `${entry.homeTeamName} ${entry.homeScore}, ${entry.awayTeamName} ${entry.awayScore}. ${statusLabel}. Started ${startedAt}.`;
  const row =
    "flex-row items-center gap-4 rounded-xl border border-surface-border bg-surface-elevated px-4 py-3";

  if (!onOpen) {
    return (
      <View accessible accessibilityLabel={label} className={row}>
        <RowContent entry={entry} startedAt={startedAt} statusLabel={statusLabel} />
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={finished ? "Shows the game's stats" : "Continues the game on this device"}
      accessibilityState={{ busy: opening }}
      accessibilityActions={onDelete ? [{ name: "delete", label: "Delete game" }] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "delete") void onDelete?.(entry);
      }}
      disabled={opening}
      onPress={() => onOpen(entry)}
      onLongPress={onDelete ? () => void onDelete(entry) : undefined}
      className={row}
    >
      <RowContent entry={entry} startedAt={startedAt} statusLabel={statusLabel} />
      {opening ? (
        <ActivityIndicator color={INK_DIM} />
      ) : (
        <Text className="text-lg text-ink-dim">›</Text>
      )}
    </Pressable>
  );
}

function RowContent({
  entry,
  startedAt,
  statusLabel,
}: {
  entry: LibraryEntry;
  startedAt: string;
  statusLabel: string;
}) {
  const finished = entry.status === "finished";
  return (
    <>
      <View className="flex-1 gap-1">
        <View className="flex-row items-baseline gap-2">
          <Text className="shrink text-base font-medium text-ink" numberOfLines={1}>
            {entry.homeTeamName}
          </Text>
          <Text className="text-sm text-ink-dim">vs</Text>
          <Text className="shrink text-base font-medium text-ink" numberOfLines={1}>
            {entry.awayTeamName}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="text-xs text-ink-dim">{startedAt}</Text>
          <Text
            className={
              finished
                ? "bg-surface-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink"
                : "bg-accent/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent"
            }
          >
            {statusLabel}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="text-lg text-ink">{entry.homeScore}</Text>
        <Text className="text-ink-dim">-</Text>
        <Text className="text-lg text-ink">{entry.awayScore}</Text>
      </View>
    </>
  );
}
