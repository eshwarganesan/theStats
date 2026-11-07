import type { GameFormat } from "@thestats/core";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { TextField } from "@/components/ui/Field";
import { ON_OFF, Segmented } from "@/components/ui/Segmented";
import { Stepper } from "@/components/ui/Stepper";
import { useGameStore } from "@/lib/store";

const FORMATS = [
  { value: "5v5", label: "5v5" },
  { value: "3v3", label: "3v3" },
] as const satisfies readonly { value: GameFormat; label: string }[];

const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;
const minSec = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * The game settings half of setup, with the same fields and limits as
 * web's. Switching format resets the timings to that format's defaults.
 */
export function GameSettingsForm() {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);

  return (
    <View className="gap-4 rounded-xl border border-surface-border bg-surface-elevated p-5">
      <Text accessibilityRole="header" className="text-xs uppercase tracking-widest text-ink-muted">
        Game settings
      </Text>
      <View className="-mx-2 flex-row flex-wrap">
        <Cell>
          <Segmented
            label="Format"
            options={FORMATS}
            value={settings.format}
            onChange={(format) => setSettings({ format })}
          />
        </Cell>
        <Cell>
          <Stepper
            label="Periods"
            value={settings.periods}
            min={1}
            max={6}
            onChange={(periods) => setSettings({ periods })}
          />
        </Cell>
        <Cell>
          <Stepper
            label="Period length"
            value={settings.periodSeconds}
            min={60}
            max={30 * 60}
            step={60}
            format={minutes}
            onChange={(periodSeconds) => setSettings({ periodSeconds })}
          />
        </Cell>
        <Cell>
          <Stepper
            label="Timeouts per game"
            value={settings.timeoutsPerGame}
            min={0}
            max={10}
            onChange={(timeoutsPerGame) => setSettings({ timeoutsPerGame })}
          />
        </Cell>
        <Cell>
          <Stepper
            label="Bonus fouls"
            value={settings.bonusFoulThreshold}
            min={1}
            max={10}
            onChange={(bonusFoulThreshold) => setSettings({ bonusFoulThreshold })}
          />
        </Cell>
        <Cell>
          <Stepper
            label="Timeout length"
            value={settings.timeoutSeconds}
            min={0}
            max={600}
            step={10}
            format={minSec}
            onChange={(timeoutSeconds) => setSettings({ timeoutSeconds })}
          />
        </Cell>
        <Cell>
          <Stepper
            label="Quarter break"
            value={settings.quarterBreakSeconds}
            min={0}
            max={30 * 60}
            step={30}
            format={minSec}
            onChange={(quarterBreakSeconds) => setSettings({ quarterBreakSeconds })}
          />
        </Cell>
        <Cell>
          <Stepper
            label="Halftime"
            value={settings.halftimeBreakSeconds}
            min={0}
            max={30 * 60}
            step={30}
            format={minSec}
            onChange={(halftimeBreakSeconds) => setSettings({ halftimeBreakSeconds })}
          />
        </Cell>
        <Cell>
          <Stepper
            label="Overtime length"
            value={settings.overtimeSeconds}
            min={0}
            max={60 * 60}
            step={60}
            format={minutes}
            onChange={(overtimeSeconds) => setSettings({ overtimeSeconds })}
          />
        </Cell>
        <Cell>
          <Segmented
            label="Overtime"
            options={ON_OFF}
            value={settings.overtimeEnabled ? "on" : "off"}
            onChange={(v) => setSettings({ overtimeEnabled: v === "on" })}
          />
        </Cell>
        <Cell>
          <Segmented
            label="Possession arrow"
            options={ON_OFF}
            value={settings.possessionArrowEnabled ? "on" : "off"}
            onChange={(v) => setSettings({ possessionArrowEnabled: v === "on" })}
          />
        </Cell>
      </View>
      <View className="-mx-2 flex-row flex-wrap">
        <Cell wide>
          <TextField
            label="Competition"
            value={settings.competition}
            onChangeText={(competition) => setSettings({ competition })}
            placeholder="e.g. Spring League 2026"
          />
        </Cell>
        <Cell wide>
          <TextField
            label="Venue"
            value={settings.venue}
            onChangeText={(venue) => setSettings({ venue })}
            placeholder="e.g. Community Arena"
          />
        </Cell>
      </View>
    </View>
  );
}

/** One grid cell: two per row on a phone, four (or two wide) on iPad. */
function Cell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <View className={wide ? "w-full px-2 pb-4 md:w-1/2" : "w-1/2 px-2 pb-4 md:w-1/4"}>{children}</View>;
}
