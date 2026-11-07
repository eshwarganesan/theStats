import { describeEvent, isEditableEvent } from "@thestats/app";
import {
  formatClock,
  formatPeriod,
  type EditableEvent,
  type GameEvent,
  type Team,
} from "@thestats/core";
import { memo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { cx } from "@/lib/cx";
import { useGame } from "@/lib/gameContext";

/** How many of the latest plays the log shows until asked for all. */
export const RECENT_PLAYS = 50;

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/**
 * The plays, newest first, worded the same as on web. Shows the latest
 * RECENT_PLAYS until "Show all" is tapped. With `onEditPlay`, tapping a
 * score, foul, stat, timeout or team play opens it for editing.
 */
export function GameLog({ onEditPlay }: { onEditPlay?: (event: EditableEvent) => void }) {
  const events = useGame((s) => s.events);
  const homeTeam = useGame((s) => s.homeTeam);
  const awayTeam = useGame((s) => s.awayTeam);
  const periods = useGame((s) => s.settings.periods);
  const [showAll, setShowAll] = useState(false);

  const shown = (showAll ? events : events.slice(-RECENT_PLAYS)).slice().reverse();

  return (
    <View className="rounded-xl border border-surface-border bg-surface-elevated">
      <View className="flex-row items-center justify-between border-b border-surface-border px-4 py-3">
        <Text accessibilityRole="header" className="text-base font-bold text-ink">
          Play by play
        </Text>
        <Text className="text-xs uppercase tracking-widest text-ink-muted">
          {events.length} {events.length === 1 ? "play" : "plays"}
        </Text>
      </View>
      {shown.length === 0 ? (
        <Text className="p-5 text-sm italic text-ink-dim">No plays yet.</Text>
      ) : (
        shown.map((event) => (
          <LogRow
            key={event.id}
            event={event}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            periods={periods}
            onEdit={isEditableEvent(event) ? onEditPlay : undefined}
          />
        ))
      )}
      {events.length > RECENT_PLAYS ? (
        <View className="items-center p-3">
          <Button
            label={showAll ? `Show the latest ${RECENT_PLAYS}` : `Show all ${events.length} plays`}
            size="sm"
            variant="ghost"
            onPress={() => setShowAll(!showAll)}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Memoised: a new play re-renders only its own row. */
const LogRow = memo(function LogRow({
  event,
  homeTeam,
  awayTeam,
  periods,
  onEdit,
}: {
  event: GameEvent;
  homeTeam: Team;
  awayTeam: Team;
  periods: number;
  onEdit?: (event: EditableEvent) => void;
}) {
  const description = describeEvent(event, homeTeam, awayTeam);
  const period = formatPeriod(event.period, periods);
  const time = formatClock(event.clockAt);
  const label = `${period} ${time}. ${description.text}`;

  const content = (
    <>
      <View className="w-14 items-center">
        <Text className="text-[11px] text-ink-dim">{period}</Text>
        <Text className="text-[11px] text-ink-muted" style={TABULAR}>
          {time}
        </Text>
      </View>
      <View
        className={cx(
          "h-6 w-1",
          description.sideColor === "home"
            ? "bg-home"
            : description.sideColor === "away"
              ? "bg-away"
              : "bg-ink-dim/40",
        )}
      />
      <Text
        className={cx("flex-1 text-sm", description.emphasis ? "font-medium text-ink" : "text-ink-muted")}
        numberOfLines={1}
      >
        {description.text}
      </Text>
      {description.tag ? (
        <Text
          className={cx(
            "rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider",
            description.tagColor === "accent" && "border-accent text-accent",
            description.tagColor === "danger" && "border-danger text-danger",
            description.tagColor === "muted" && "border-surface-border text-ink-dim",
          )}
        >
          {description.tag}
        </Text>
      ) : null}
    </>
  );
  const row = "flex-row items-center gap-3 border-b border-surface-border px-4 py-2";

  if (onEdit && isEditableEvent(event)) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Edit or delete this play"
        onPress={() => onEdit(event)}
        className={row}
      >
        {content}
        <Text className="text-ink-dim">›</Text>
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={label} className={row}>
      {content}
    </View>
  );
});
