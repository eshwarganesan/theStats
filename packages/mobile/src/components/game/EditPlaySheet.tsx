import { describeEvent } from "@thestats/app";
import {
  FOUL_LABELS,
  SCORE_LABELS,
  STAT_LABELS,
  TEAM_TURNOVER_KINDS,
  formatClock,
  parseClock,
  type EditEventPatch,
  type EditableEvent,
  type FoulKind,
  type ScoreKind,
  type Side,
  type StatKind,
  type TeamTurnoverKind,
} from "@thestats/core";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { ChoiceGrid } from "@/components/ui/ChoiceGrid";
import { Field, TextField } from "@/components/ui/Field";
import { Segmented, type SegmentedOption } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { confirm } from "@/lib/confirm";
import { cx } from "@/lib/cx";
import { useGameStore } from "@/lib/store";
import { useLatest } from "@/lib/useLatest";

/** Every editable field, whichever kind of play is being edited. */
interface Draft {
  clock: string;
  side: Side;
  /** Null once the side changes to one the player isn't on. */
  playerId: string | null;
  scoreKind: ScoreKind;
  made: boolean;
  foulKind: FoulKind;
  statKind: StatKind;
  turnoverKind: TeamTurnoverKind;
  points: string;
  reason: string;
}

function draftFor(event: EditableEvent): Draft {
  const draft: Draft = {
    clock: formatClock(event.clockAt),
    side: event.side,
    playerId: null,
    scoreKind: "2pt",
    made: true,
    foulKind: "personal",
    statKind: "rebound-off",
    turnoverKind: "8-second",
    points: "",
    reason: "",
  };
  switch (event.type) {
    case "score":
      return { ...draft, playerId: event.playerId, scoreKind: event.kind, made: event.made };
    case "foul":
      return { ...draft, playerId: event.playerId, foulKind: event.kind };
    case "stat":
      return { ...draft, playerId: event.playerId, statKind: event.kind };
    case "team-turnover":
      return { ...draft, turnoverKind: event.kind };
    case "team-score-adjust":
      return { ...draft, points: String(event.points), reason: event.reason };
    case "timeout":
      return draft;
  }
}

/**
 * The patch that saves `draft` over `event`: every editable field of its
 * kind. The store checks it (player on that side's roster, time within
 * the period, awards above zero) and applies only these fields.
 */
function patchFor(event: EditableEvent, draft: Draft, clockAt: number): EditEventPatch {
  const common = { clockAt, side: draft.side };
  const player = draft.playerId === null ? {} : { playerId: draft.playerId };
  switch (event.type) {
    case "score":
      return { type: "score", ...common, ...player, kind: draft.scoreKind, made: draft.made };
    case "foul":
      return { type: "foul", ...common, ...player, kind: draft.foulKind };
    case "stat":
      return { type: "stat", ...common, ...player, kind: draft.statKind };
    case "team-turnover":
      return { type: "team-turnover", ...common, kind: draft.turnoverKind };
    case "team-score-adjust":
      return { type: "team-score-adjust", ...common, points: Number(draft.points), reason: draft.reason };
    case "timeout":
      return { type: "timeout", ...common };
  }
}

const choices = <T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): SegmentedOption<T>[] => values.map((value) => ({ value, label: labels[value] }));

const SHOT_KINDS = choices<ScoreKind>(["2pt", "3pt", "ft"], SCORE_LABELS);
const FOUL_KINDS = choices<FoulKind>(
  ["personal", "technical", "unsportsmanlike", "disqualifying", "offensive"],
  FOUL_LABELS,
);
const STAT_KINDS = choices<StatKind>(
  ["rebound-off", "rebound-def", "assist", "steal", "block", "turnover"],
  STAT_LABELS,
);
const VIOLATIONS: SegmentedOption<TeamTurnoverKind>[] = TEAM_TURNOVER_KINDS.map(({ kind, label }) => ({
  value: kind,
  label,
}));
const OUTCOMES: SegmentedOption<"made" | "missed">[] = [
  { value: "made", label: "Made" },
  { value: "missed", label: "Missed" },
];

/**
 * Correct or delete a recorded play (spec 004): its time, team, player
 * and kind. Opened by tapping the play in the log. Stays mounted like the
 * other game sheets.
 */
export function EditPlaySheet({
  event,
  onClose,
}: {
  event: EditableEvent | null;
  onClose: () => void;
}) {
  const shown = useLatest(event);
  const homeTeam = useGameStore((s) => s.homeTeam);
  const awayTeam = useGameStore((s) => s.awayTeam);
  const settings = useGameStore((s) => s.settings);
  const { editEvent, deleteEvent } = useGameStore.getState();
  const [draft, setDraft] = useState<Draft | null>(event ? draftFor(event) : null);
  const [openedFor, setOpenedFor] = useState(event);
  if (event !== openedFor) {
    setOpenedFor(event);
    if (event) setDraft(draftFor(event));
  }

  if (!shown || !draft) {
    return <Sheet visible={false} title="Edit play" onClose={onClose}>{null}</Sheet>;
  }

  const update = (changes: Partial<Draft>) => setDraft({ ...draft, ...changes });
  const needsPlayer = shown.type === "score" || shown.type === "foul" || shown.type === "stat";
  const team = draft.side === "home" ? homeTeam : awayTeam;
  const periodLength =
    shown.period > settings.periods ? settings.overtimeSeconds : settings.periodSeconds;
  const clockAt = parseClock(draft.clock);
  const clockError =
    clockAt === null
      ? "Use minutes and seconds, like 4:30."
      : clockAt > periodLength
        ? `Must be ${formatClock(periodLength)} or less.`
        : null;
  const points = Number(draft.points);
  const pointsError =
    shown.type === "team-score-adjust" &&
    (draft.points.trim() === "" || !Number.isInteger(points) || points <= 0)
      ? "Points must be a whole number above zero."
      : null;
  const playerMissing = needsPlayer && draft.playerId === null;
  const canSave = clockAt !== null && !clockError && !pointsError && !playerMissing;

  const changeSide = (side: Side) => {
    const roster = side === "home" ? homeTeam.roster : awayTeam.roster;
    const keepsPlayer = roster.some((p) => p.id === draft.playerId);
    update({ side, playerId: keepsPlayer ? draft.playerId : null });
  };

  const save = () => {
    if (!canSave) return;
    editEvent(shown.id, patchFor(shown, draft, clockAt));
    onClose();
  };

  const remove = async () => {
    const play = describeEvent(shown, homeTeam, awayTeam).text;
    const sure = await confirm(
      "Delete play?",
      `${formatClock(shown.clockAt)} ${play}\n\nIt's removed from the log and the stats update right away.`,
      "Delete",
      "destructive",
    );
    if (!sure) return;
    deleteEvent(shown.id);
    onClose();
  };

  return (
    <Sheet
      visible={event !== null}
      title="Edit play"
      onClose={onClose}
      footer={
        <>
          <Button label="Delete play" variant="danger" onPress={remove} className="mr-auto" />
          <Button label="Cancel" variant="ghost" onPress={onClose} />
          <Button label="Save" variant="primary" disabled={!canSave} onPress={save} />
        </>
      }
    >
      <View className="gap-1.5">
        <TextField
          label="Clock time"
          value={draft.clock}
          onChangeText={(clock) => update({ clock })}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          className={clockError ? "border-danger" : undefined}
        />
        {clockError ? (
          <Text accessibilityRole="alert" className="text-xs text-danger">
            {clockError}
          </Text>
        ) : null}
      </View>

      <Segmented
        label="Team"
        options={[
          { value: "home", label: homeTeam.name || "Home" },
          { value: "away", label: awayTeam.name || "Away" },
        ]}
        value={draft.side}
        onChange={changeSide}
      />

      {needsPlayer ? (
        <Field label="Player">
          <View accessibilityRole="radiogroup" accessibilityLabel="Player" className="gap-1">
            {team.roster.map((p) => {
              const selected = draft.playerId === p.id;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityLabel={`Player: ${p.name}`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => update({ playerId: p.id })}
                  className={cx(
                    "flex-row items-center gap-3 rounded-lg border px-3 py-2",
                    selected ? "border-accent bg-accent/5" : "border-surface-border bg-surface-raised",
                  )}
                >
                  <Text className="w-8 text-right text-ink-muted">{p.number}</Text>
                  <Text className={cx("text-sm", selected ? "text-ink" : "text-ink-muted")}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {playerMissing ? (
            <Text className="text-xs text-warning">Pick who made the play on {team.name}.</Text>
          ) : null}
        </Field>
      ) : null}

      {shown.type === "score" ? (
        <>
          <Segmented
            label="Shot"
            options={SHOT_KINDS}
            value={draft.scoreKind}
            onChange={(scoreKind) => update({ scoreKind })}
          />
          <Segmented
            label="Outcome"
            options={OUTCOMES}
            value={draft.made ? "made" : "missed"}
            onChange={(outcome) => update({ made: outcome === "made" })}
          />
        </>
      ) : null}
      {shown.type === "foul" ? (
        <ChoiceGrid
          label="Foul"
          tone="danger"
          options={FOUL_KINDS}
          value={draft.foulKind}
          onChange={(foulKind) => update({ foulKind })}
        />
      ) : null}
      {shown.type === "stat" ? (
        <ChoiceGrid
          label="Stat"
          options={STAT_KINDS}
          value={draft.statKind}
          onChange={(statKind) => update({ statKind })}
        />
      ) : null}
      {shown.type === "team-turnover" ? (
        <ChoiceGrid
          label="Violation"
          options={VIOLATIONS}
          value={draft.turnoverKind}
          onChange={(turnoverKind) => update({ turnoverKind })}
        />
      ) : null}
      {shown.type === "team-score-adjust" ? (
        <>
          <View className="gap-1.5">
            <TextField
              label="Points"
              value={draft.points}
              onChangeText={(value) => update({ points: value })}
              keyboardType="number-pad"
            />
            {pointsError ? (
              <Text accessibilityRole="alert" className="text-xs text-danger">
                {pointsError}
              </Text>
            ) : null}
          </View>
          <TextField
            label="Reason (optional)"
            value={draft.reason}
            onChangeText={(reason) => update({ reason })}
          />
        </>
      ) : null}
    </Sheet>
  );
}
