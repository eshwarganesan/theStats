import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { LibraryEntry } from "@thestats/app";
import type { ReactElement } from "react";
import { Text, type RefreshControlProps } from "react-native";

import { listGames, type ListGamesResult } from "@/lib/games";

import { GameLibrary } from "./GameLibrary";

jest.mock("@/lib/games", () => ({ listGames: jest.fn() }));
const listGamesMock = jest.mocked(listGames);

function entry(id: string, overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id,
    status: "in-progress",
    homeTeamName: `Home ${id}`,
    awayTeamName: `Away ${id}`,
    homeScore: 10,
    awayScore: 8,
    eventCount: 12,
    currentPeriod: 2,
    startedAt: "2026-10-01T18:00:00Z",
    lastActivityAt: "2026-10-01T18:40:00Z",
    finishedAt: null,
    ...overrides,
  };
}

const page = (entries: LibraryEntry[], nextCursor: string | null = null): ListGamesResult => ({
  ok: true,
  page: { entries, nextCursor },
});
const failure = (message = "Couldn't load your games. Please try again."): ListGamesResult => ({
  ok: false,
  message,
});

/** A listGames call the test settles by hand. */
function deferred() {
  let resolve: (result: ListGamesResult) => void = () => {};
  const promise = new Promise<ListGamesResult>((r) => (resolve = r));
  listGamesMock.mockReturnValueOnce(promise);
  return {
    resolve: (result: ListGamesResult) => act(async () => resolve(result)),
  };
}

/** What iOS does when the user pulls the list down. */
async function pullToRefresh() {
  const control: ReactElement<RefreshControlProps> =
    screen.getByTestId("game-library").props.refreshControl;
  await act(async () => control.props.onRefresh?.());
}

beforeEach(() => listGamesMock.mockReset());

describe("<GameLibrary />", () => {
  it("shows a spinner, then the user's games under the header", async () => {
    const first = deferred();
    await render(<GameLibrary header={<Text>Device game</Text>} />);
    expect(screen.getByText("Device game")).toBeOnTheScreen();
    expect(screen.getByLabelText("Loading your games")).toBeOnTheScreen();

    await first.resolve(
      page([
        entry("a", {
          homeTeamName: "Central",
          awayTeamName: "Eastridge",
          homeScore: 42,
          awayScore: 39,
        }),
        entry("b", { status: "finished" }),
      ]),
    );

    expect(listGamesMock).toHaveBeenCalledWith(null);
    expect(screen.getByText("Central")).toBeOnTheScreen();
    expect(screen.getByText("Eastridge")).toBeOnTheScreen();
    expect(screen.getByText("42")).toBeOnTheScreen();
    expect(screen.getByText("39")).toBeOnTheScreen();
    expect(screen.getByText("In progress")).toBeOnTheScreen();
    expect(screen.getByText("Final")).toBeOnTheScreen();
    expect(screen.getByText("2 games")).toBeOnTheScreen();
    expect(
      screen.getByLabelText(/^Central 42, Eastridge 39\. In progress\. Started /),
    ).toBeOnTheScreen();
  });

  it("says when the library is empty", async () => {
    listGamesMock.mockResolvedValueOnce(page([]));
    await render(<GameLibrary />);
    expect(await screen.findByText("Your library is empty")).toBeOnTheScreen();
  });

  it("counts a single game", async () => {
    listGamesMock.mockResolvedValueOnce(page([entry("a")]));
    await render(<GameLibrary />);
    expect(await screen.findByText("1 game")).toBeOnTheScreen();
  });

  it("offers a retry when the first load fails", async () => {
    listGamesMock.mockResolvedValueOnce(failure("Can't reach theStats."));
    await render(<GameLibrary />);
    expect(await screen.findByText("Can't reach theStats.")).toBeOnTheScreen();

    listGamesMock.mockResolvedValueOnce(page([entry("a")]));
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

    expect(listGamesMock).toHaveBeenLastCalledWith(null);
    expect(await screen.findByText("Home a")).toBeOnTheScreen();
  });

  it("loads the next page near the end of the list, and stops at the last page", async () => {
    listGamesMock.mockResolvedValueOnce(page([entry("a")], "cursor-1"));
    await render(<GameLibrary />);
    await screen.findByText("Home a");

    const next = deferred();
    await fireEvent(screen.getByTestId("game-library"), "endReached");
    expect(screen.getByLabelText("Loading more games")).toBeOnTheScreen();
    // A second end-of-list event while loading doesn't fetch twice.
    await fireEvent(screen.getByTestId("game-library"), "endReached");
    await next.resolve(page([entry("b")]));

    expect(listGamesMock).toHaveBeenLastCalledWith("cursor-1");
    expect(listGamesMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Home a")).toBeOnTheScreen();
    expect(screen.getByText("Home b")).toBeOnTheScreen();

    await fireEvent(screen.getByTestId("game-library"), "endReached");
    expect(listGamesMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the list and offers a retry when the next page fails", async () => {
    listGamesMock
      .mockResolvedValueOnce(page([entry("a")], "cursor-1"))
      .mockResolvedValueOnce(failure());
    await render(<GameLibrary />);
    await screen.findByText("Home a");

    await fireEvent(screen.getByTestId("game-library"), "endReached");
    expect(
      await screen.findByText("Couldn't load your games. Please try again."),
    ).toBeOnTheScreen();
    expect(screen.getByText("Home a")).toBeOnTheScreen();
    // No automatic retry loop while the error is showing.
    await fireEvent(screen.getByTestId("game-library"), "endReached");
    expect(listGamesMock).toHaveBeenCalledTimes(2);

    listGamesMock.mockResolvedValueOnce(page([entry("b")]));
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(listGamesMock).toHaveBeenLastCalledWith("cursor-1");
    expect(await screen.findByText("Home b")).toBeOnTheScreen();
  });

  it("replaces the list on pull to refresh", async () => {
    listGamesMock.mockResolvedValueOnce(page([entry("a")]));
    await render(<GameLibrary />);
    await screen.findByText("Home a");

    listGamesMock.mockResolvedValueOnce(page([entry("new")]));
    await pullToRefresh();

    expect(listGamesMock).toHaveBeenLastCalledWith(null);
    expect(await screen.findByText("Home new")).toBeOnTheScreen();
    expect(screen.queryByText("Home a")).toBeNull();
  });

  it("retries a failed refresh from the top", async () => {
    listGamesMock
      .mockResolvedValueOnce(page([entry("a")], "cursor-1"))
      .mockResolvedValueOnce(failure());
    await render(<GameLibrary />);
    await screen.findByText("Home a");

    await pullToRefresh();
    listGamesMock.mockResolvedValueOnce(page([entry("fresh")]));
    await fireEvent.press(await screen.findByRole("button", { name: "Try again" }));

    expect(listGamesMock).toHaveBeenLastCalledWith(null);
    expect(await screen.findByText("Home fresh")).toBeOnTheScreen();
  });

  it("ignores a response that arrives after unmount", async () => {
    const first = deferred();
    const { unmount } = await render(<GameLibrary />);
    await unmount();
    await first.resolve(page([entry("late")]));
    expect(screen.queryByText("Home late")).toBeNull();
  });
});

describe("<GameLibrary /> actions", () => {
  const finished = entry("f", { status: "finished", homeTeamName: "Final Home" });
  const live = entry("l", { homeTeamName: "Live Home" });
  const rowLabel = /^Final Home 10, Away f 8\. Final\./;

  it("opens a tapped game, with a hint saying what tapping does", async () => {
    listGamesMock.mockResolvedValueOnce(page([finished, live]));
    const onOpen = jest.fn();
    await render(<GameLibrary onOpen={onOpen} />);

    const row = await screen.findByRole("button", { name: rowLabel });
    expect(row).toHaveProp("accessibilityHint", "Shows the game's stats");
    expect(screen.getByRole("button", { name: /^Live Home/ })).toHaveProp(
      "accessibilityHint",
      "Continues the game on this device",
    );
    await fireEvent.press(row);
    expect(onOpen).toHaveBeenCalledWith(finished);
  });

  it("shows a spinner on the game being opened", async () => {
    listGamesMock.mockResolvedValueOnce(page([live]));
    await render(<GameLibrary onOpen={jest.fn()} openingId="l" />);
    const row = await screen.findByRole("button", { name: /^Live Home/ });
    expect(row).toBeDisabled();
    expect(row).toBeBusy();
  });

  it("deletes a game on long press once the deletion succeeds", async () => {
    listGamesMock.mockResolvedValueOnce(page([finished, live]));
    const onDelete = jest.fn(async () => true);
    await render(<GameLibrary onOpen={jest.fn()} onDelete={onDelete} />);

    await fireEvent(await screen.findByRole("button", { name: rowLabel }), "longPress");
    expect(onDelete).toHaveBeenCalledWith(finished);
    expect(screen.queryByText("Final Home")).toBeNull();
    expect(screen.getByText("1 game")).toBeOnTheScreen();
  });

  it("keeps a game whose deletion was cancelled, and offers Delete to VoiceOver", async () => {
    listGamesMock.mockResolvedValueOnce(page([live]));
    const onDelete = jest.fn(async () => false);
    await render(<GameLibrary onOpen={jest.fn()} onDelete={onDelete} />);
    const row = await screen.findByRole("button", { name: /^Live Home/ });

    expect(row).toHaveProp("accessibilityActions", [{ name: "delete", label: "Delete game" }]);
    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "delete" } });
    expect(onDelete).toHaveBeenCalledWith(live);
    expect(screen.getByText("Live Home")).toBeOnTheScreen();

    // Other actions do nothing.
    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "activate" } });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("reloads when the refresh key changes", async () => {
    listGamesMock.mockResolvedValueOnce(page([live]));
    const view = await render(<GameLibrary refreshKey={0} />);
    await screen.findByText("Live Home");

    listGamesMock.mockResolvedValueOnce(page([finished]));
    await view.rerender(<GameLibrary refreshKey={1} />);
    expect(await screen.findByText("Final Home")).toBeOnTheScreen();
    expect(listGamesMock).toHaveBeenCalledTimes(2);

    // Re-rendering with the same key doesn't reload.
    await view.rerender(<GameLibrary refreshKey={1} />);
    expect(listGamesMock).toHaveBeenCalledTimes(2);
  });
});
