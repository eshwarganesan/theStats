import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { GameEvent } from "@thestats/core";
import { Alert } from "react-native";

import GameScreen from "@/app/game";
import { RECENT_PLAYS } from "@/components/game/GameLog";
import { useGameStore } from "@/lib/store";
import { player, startLiveGame } from "@/test/gameFixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: jest.fn() }));

const state = () => useGameStore.getState();
const play = (id: string): GameEvent | undefined => state().events.find((e) => e.id === id);
const lastId = () => state().events.at(-1)?.id ?? "";

function sheet() {
  return within(screen.getByTestId("sheet"));
}

/** Opens the log row for the play described as `text`. */
async function openPlay(text: string) {
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`\\. ${text}$`) }));
  expect(sheet().getByRole("header", { name: "Edit play" })).toBeOnTheScreen();
}

async function choose(name: string) {
  await fireEvent.press(sheet().getByRole("radio", { name }));
}

async function save() {
  await fireEvent.press(sheet().getByRole("button", { name: "Save" }));
}

function answerAlerts(answer: string) {
  return jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.text === answer)?.onPress?.();
  });
}

beforeEach(() => {
  startLiveGame();
});

afterEach(() => jest.restoreAllMocks());

describe("editing a play from the log", () => {
  it("corrects the time it happened", async () => {
    state().recordScore("home", player("home", "10").id, "3pt", true);
    const id = lastId();
    await render(<GameScreen />);

    await openPlay("#10 Jordan scored 3");
    await fireEvent.changeText(sheet().getByLabelText("Clock time"), "9:30");
    await save();

    expect(play(id)).toMatchObject({ clockAt: 570, kind: "3pt", made: true });
    expect(screen.queryByTestId("sheet")).toBeNull();
    expect(screen.getByRole("button", { name: "1st 09:30. #10 Jordan scored 3" })).toBeOnTheScreen();
  });

  it("explains a time it can't use, and won't save it", async () => {
    state().recordScore("home", player("home", "10").id, "2pt", true);
    await render(<GameScreen />);
    await openPlay("#10 Jordan scored 2");

    await fireEvent.changeText(sheet().getByLabelText("Clock time"), "soon");
    expect(sheet().getByRole("alert")).toHaveTextContent("Use minutes and seconds, like 4:30.");
    expect(sheet().getByRole("button", { name: "Save" })).toBeDisabled();

    await fireEvent.changeText(sheet().getByLabelText("Clock time"), "11:00");
    expect(sheet().getByRole("alert")).toHaveTextContent("Must be 10:00 or less.");
    expect(sheet().getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("moves a play to the other team once its player is picked", async () => {
    state().recordScore("home", player("home", "10").id, "2pt", true);
    const id = lastId();
    await render(<GameScreen />);
    await openPlay("#10 Jordan scored 2");

    await choose("Team: Eastridge");
    expect(sheet().getByText("Pick who made the play on Eastridge.")).toBeOnTheScreen();
    expect(sheet().getByRole("button", { name: "Save" })).toBeDisabled();

    await choose("Player: Bird");
    await save();
    expect(play(id)).toMatchObject({ side: "away", playerId: player("away", "30").id });
    expect(screen.getByLabelText("Eastridge 2")).toBeOnTheScreen();
  });

  it("keeps the player when switching back to their team", async () => {
    state().recordScore("home", player("home", "10").id, "2pt", true);
    await render(<GameScreen />);
    await openPlay("#10 Jordan scored 2");

    await choose("Team: Eastridge");
    await choose("Player: Bird");
    await choose("Team: Central");
    expect(sheet().getByText("Pick who made the play on Central.")).toBeOnTheScreen();
    await choose("Player: Pippen");
    expect(sheet().getByRole("radio", { name: "Player: Pippen" })).toBeChecked();
  });

  it("changes a shot's kind and outcome", async () => {
    state().recordScore("home", player("home", "11").id, "2pt", true);
    const id = lastId();
    await render(<GameScreen />);
    await openPlay("#11 Pippen scored 2");

    await choose("Shot: 3 PT");
    await choose("Outcome: Missed");
    await save();
    expect(play(id)).toMatchObject({ kind: "3pt", made: false });
    expect(screen.getByLabelText("Central 0")).toBeOnTheScreen();
  });

  it("changes a foul's or a stat's kind", async () => {
    state().recordFoul("away", player("away", "31").id, "personal");
    const foul = lastId();
    state().recordStat("away", player("away", "32").id, "assist");
    const stat = lastId();
    await render(<GameScreen />);

    await openPlay("#31 McHale — Personal foul");
    await choose("Foul: Technical");
    await save();
    expect(play(foul)).toMatchObject({ kind: "technical" });

    await openPlay("#32 Parish — Assist");
    await choose("Stat: Steal");
    await save();
    expect(play(stat)).toMatchObject({ kind: "steal" });
  });

  it("edits a timeout and a team turnover", async () => {
    state().recordTimeout("home");
    const timeout = lastId();
    state().endTimeout();
    state().recordTeamTurnover("away", "24-second");
    const turnover = lastId();
    await render(<GameScreen />);

    await openPlay("CEN timeout");
    await choose("Team: Eastridge");
    await save();
    expect(play(timeout)).toMatchObject({ side: "away" });

    await openPlay("EST — 24-Second Violation \\(team TO\\)");
    await choose("Violation: Backcourt Violation");
    await save();
    expect(play(turnover)).toMatchObject({ kind: "backcourt" });
  });

  it("only saves an award of whole points above zero", async () => {
    state().recordTeamScoreAdjust("home", 5, "missing jersey");
    const id = lastId();
    await render(<GameScreen />);
    await openPlay("CEN \\+5 — missing jersey");

    await fireEvent.changeText(sheet().getByLabelText("Points"), "0");
    expect(sheet().getByRole("alert")).toHaveTextContent("Points must be a whole number above zero.");
    expect(sheet().getByRole("button", { name: "Save" })).toBeDisabled();

    await fireEvent.changeText(sheet().getByLabelText("Points"), "2");
    await fireEvent.changeText(sheet().getByLabelText("Reason (optional)"), "technical");
    await save();
    expect(play(id)).toMatchObject({ points: 2, reason: "technical" });
  });

  it("deletes a play once you confirm", async () => {
    state().recordScore("home", player("home", "10").id, "3pt", true);
    const id = lastId();
    await render(<GameScreen />);

    answerAlerts("Cancel");
    await openPlay("#10 Jordan scored 3");
    await fireEvent.press(sheet().getByRole("button", { name: "Delete play" }));
    expect(play(id)).toBeDefined();

    jest.restoreAllMocks();
    const alert = answerAlerts("Delete");
    await fireEvent.press(sheet().getByRole("button", { name: "Delete play" }));
    expect(alert).toHaveBeenCalledWith(
      "Delete play?",
      expect.stringContaining("10:00 #10 Jordan scored 3"),
      expect.any(Array),
      expect.any(Object),
    );
    expect(play(id)).toBeUndefined();
    expect(screen.getByLabelText("Central 0")).toBeOnTheScreen();
    expect(screen.queryByTestId("sheet")).toBeNull();
  });

  it("discards changes on Cancel", async () => {
    state().recordScore("home", player("home", "10").id, "3pt", true);
    const id = lastId();
    await render(<GameScreen />);
    await openPlay("#10 Jordan scored 3");
    await fireEvent.changeText(sheet().getByLabelText("Clock time"), "1:00");
    await fireEvent.press(sheet().getByRole("button", { name: "Cancel" }));
    expect(play(id)).toMatchObject({ clockAt: 600 });

    // Reopening starts from the play as recorded.
    await openPlay("#10 Jordan scored 3");
    expect(sheet().getByLabelText("Clock time")).toHaveDisplayValue("10:00");
  });

  it("doesn't offer edits for substitutions or the clock", async () => {
    state().startClock();
    state().stopClock();
    await render(<GameScreen />);
    expect(screen.getByLabelText("1st 10:00. Clock start")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Clock start/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Period start/ })).toBeNull();
  });
});

describe("the play log", () => {
  it(`shows the latest ${RECENT_PLAYS} plays until asked for all`, async () => {
    for (let i = 0; i < RECENT_PLAYS + 4; i++) {
      state().recordStat("home", player("home", "12").id, "rebound-def");
    }
    const total = state().events.length;
    await render(<GameScreen />);

    expect(screen.getAllByRole("button", { name: /Rodman — Def\. Reb$/ })).toHaveLength(RECENT_PLAYS);
    await fireEvent.press(screen.getByRole("button", { name: `Show all ${total} plays` }));
    expect(screen.getAllByRole("button", { name: /Rodman — Def\. Reb$/ })).toHaveLength(RECENT_PLAYS + 4);
    expect(screen.getByLabelText("1st 10:00. Period start")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: `Show the latest ${RECENT_PLAYS}` }));
    expect(screen.getAllByRole("button", { name: /Rodman — Def\. Reb$/ })).toHaveLength(RECENT_PLAYS);
  });

  it("updates as plays are recorded", async () => {
    await render(<GameScreen />);
    expect(screen.getByText("1 play")).toBeOnTheScreen();
    await act(async () => state().recordStat("away", player("away", "33").id, "block"));
    expect(screen.getByText("2 plays")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "1st 10:00. #33 Ainge — Block" })).toBeOnTheScreen();
  });
});
