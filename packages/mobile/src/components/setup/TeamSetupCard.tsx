import { PLAYERS_ON_COURT, type Player, type Side } from "@thestats/core";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Field, INPUT_CLASS, TextField } from "@/components/ui/Field";
import { cx } from "@/lib/cx";
import { useGameStore } from "@/lib/store";

/** Team colours to pick from; the defaults are home blue and away red. */
const PALETTE = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6B7280",
  "#F5F5F4",
];

/**
 * One team's half of setup: name, tag, coach, colour and roster, with
 * starters and captain. Mirrors web's card, including its limits: a
 * starter can only be added while the line-up isn't full, and jersey
 * numbers must be unique.
 */
export function TeamSetupCard({ side }: { side: Side }) {
  const team = useGameStore((s) => (side === "home" ? s.homeTeam : s.awayTeam));
  const format = useGameStore((s) => s.settings.format);
  const setTeam = useGameStore((s) => s.setTeam);
  const addPlayer = useGameStore((s) => s.addPlayer);

  const [newNumber, setNewNumber] = useState("");
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const startersTarget = PLAYERS_ON_COURT[format];
  const startersCount = team.roster.filter((p) => p.isStarter).length;
  const canAddStarter = startersCount < startersTarget;
  const canAdd = newNumber.trim() !== "" && newName.trim() !== "";
  const swatches = PALETTE.some((c) => c.toLowerCase() === team.color.toLowerCase())
    ? PALETTE
    : [team.color, ...PALETTE];

  const onAdd = () => {
    const number = newNumber.trim();
    const name = newName.trim();
    if (!number || !name) return;
    if (team.roster.some((p) => p.number === number)) {
      setAddError(`#${number} is already on the roster.`);
      return;
    }
    addPlayer(side, { number, name, isStarter: canAddStarter, isCaptain: false });
    setNewNumber("");
    setNewName("");
    setAddError(null);
  };

  return (
    <View
      className={cx(
        "flex-1 rounded-xl border border-l-4 border-surface-border bg-surface-elevated",
        side === "home" ? "border-l-home" : "border-l-away",
      )}
    >
      <View className="flex-row items-center justify-between border-b border-surface-border px-5 py-4">
        <View className="shrink flex-row items-center gap-3">
          <Text
            className={cx(
              "rounded border px-2 py-0.5 text-[10px] uppercase tracking-widest",
              side === "home" ? "border-home/40 text-home" : "border-away/40 text-away",
            )}
          >
            {side}
          </Text>
          <Text accessibilityRole="header" className="shrink text-xl font-bold text-ink" numberOfLines={1}>
            {team.name || "Unnamed team"}
          </Text>
        </View>
        <Text
          accessibilityLabel={`${startersCount} of ${startersTarget} starters`}
          className={cx(
            "text-sm",
            startersCount === startersTarget ? "text-success" : "text-warning",
          )}
        >
          Starters {startersCount}/{startersTarget}
        </Text>
      </View>

      <View className="-mx-1.5 flex-row flex-wrap border-b border-surface-border px-5 pb-1 pt-4">
        <View className="w-1/2 px-1.5 pb-3">
          <TextField
            label="Team name"
            value={team.name}
            onChangeText={(name) => setTeam(side, { name })}
            placeholder={side === "home" ? "Home" : "Away"}
            maxLength={40}
          />
        </View>
        <View className="w-1/2 px-1.5 pb-3">
          <TextField
            label="Tag (3 letters)"
            value={team.tag}
            onChangeText={(tag) => setTeam(side, { tag: tag.toUpperCase().slice(0, 3) })}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={3}
          />
        </View>
        <View className="w-1/2 px-1.5 pb-3">
          <TextField
            label="Head coach"
            value={team.coach}
            onChangeText={(coach) => setTeam(side, { coach })}
            placeholder="Optional"
            maxLength={40}
          />
        </View>
        <View className="w-1/2 px-1.5 pb-3">
          <Field label="Team colour">
            <View className="flex-row flex-wrap gap-2">
              {swatches.map((color) => {
                const selected = color.toLowerCase() === team.color.toLowerCase();
                return (
                  <Pressable
                    key={color}
                    accessibilityRole="radio"
                    accessibilityLabel={`Team colour ${color}`}
                    accessibilityState={{ checked: selected }}
                    onPress={() => setTeam(side, { color })}
                    className={cx(
                      "h-8 w-8 rounded-full border-2",
                      selected ? "border-ink" : "border-transparent",
                    )}
                    style={{ backgroundColor: color }}
                  />
                );
              })}
            </View>
          </Field>
        </View>
      </View>

      <View className="gap-3 px-5 py-4">
        <Text className="text-xs uppercase tracking-widest text-ink-muted">
          Roster ({team.roster.length})
        </Text>
        {team.roster.length === 0 ? (
          <Text className="rounded-lg border border-dashed border-surface-border py-6 text-center text-sm italic text-ink-dim">
            No players yet. Add at least {startersTarget} to start.
          </Text>
        ) : (
          <View className="gap-2">
            {team.roster.map((player) => (
              <PlayerRow
                key={player.id}
                side={side}
                player={player}
                canBecomeStarter={canAddStarter}
              />
            ))}
          </View>
        )}

        <View className="flex-row items-center gap-2 pt-2">
          <TextInput
            accessibilityLabel={`New ${side} player number`}
            value={newNumber}
            onChangeText={(text) => {
              setNewNumber(text.slice(0, 3));
              setAddError(null);
            }}
            keyboardType="number-pad"
            placeholder="#"
            placeholderTextColor="#737373"
            className={cx(INPUT_CLASS, "w-16 text-center")}
          />
          <TextInput
            accessibilityLabel={`New ${side} player name`}
            value={newName}
            onChangeText={setNewName}
            placeholder="Player name"
            placeholderTextColor="#737373"
            returnKeyType="done"
            onSubmitEditing={onAdd}
            className={cx(INPUT_CLASS, "flex-1")}
          />
          <Button
            label="Add"
            accessibilityLabel={`Add ${side} player`}
            disabled={!canAdd}
            onPress={onAdd}
          />
        </View>
        {addError ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            {addError}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function PlayerRow({
  side,
  player,
  canBecomeStarter,
}: {
  side: Side;
  player: Player;
  canBecomeStarter: boolean;
}) {
  const updatePlayer = useGameStore((s) => s.updatePlayer);
  const removePlayer = useGameStore((s) => s.removePlayer);
  const who = player.name || `#${player.number}`;

  return (
    <View className="flex-row items-center gap-2">
      <TextInput
        accessibilityLabel={`${who} jersey number`}
        value={player.number}
        onChangeText={(number) => updatePlayer(side, player.id, { number: number.slice(0, 3) })}
        keyboardType="number-pad"
        className={cx(INPUT_CLASS, "w-16 text-center")}
      />
      <TextInput
        accessibilityLabel={`${who} name`}
        value={player.name}
        onChangeText={(name) => updatePlayer(side, player.id, { name })}
        className={cx(INPUT_CLASS, "flex-1")}
      />
      <Toggle
        label="ST"
        accessibilityLabel={`${who} starts`}
        checked={player.isStarter}
        disabled={!player.isStarter && !canBecomeStarter}
        onChange={(isStarter) => updatePlayer(side, player.id, { isStarter })}
      />
      <Toggle
        label="C"
        accessibilityLabel={`${who} is captain`}
        checked={player.isCaptain}
        onChange={(isCaptain) => updatePlayer(side, player.id, { isCaptain })}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${who}`}
        onPress={() => removePlayer(side, player.id)}
        hitSlop={8}
        className="h-10 w-8 items-center justify-center"
      >
        <Text className="text-base text-ink-dim">✕</Text>
      </Pressable>
    </View>
  );
}

function Toggle({
  label,
  accessibilityLabel,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  accessibilityLabel: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      className={cx(
        "h-10 w-11 items-center justify-center rounded-lg border",
        checked ? "border-accent bg-accent/15" : "border-surface-border",
        disabled && "opacity-30",
      )}
    >
      <Text className={cx("text-xs font-semibold", checked ? "text-accent" : "text-ink-dim")}>
        {label}
      </Text>
    </Pressable>
  );
}
