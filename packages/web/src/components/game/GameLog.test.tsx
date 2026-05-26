import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { GameLog } from "./GameLog";
import { seedReadyGame, addBench } from "@/test/seed";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

describe("GameLog", () => {
  it("renders the empty state when no events", () => {
    seedReadyGame();
    render(<GameLog />);
    expect(screen.getByText("No actions yet.")).toBeInTheDocument();
    expect(screen.getByText("0 events")).toBeInTheDocument();
  });

  it("lists events in reverse chronological order", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordScore("home", players.homePlayer(0).id, "2pt", true);
    useGameStore.getState().recordScore("away", players.awayPlayer(0).id, "3pt", true);
    render(<GameLog />);
    const items = screen.getAllByRole("listitem");
    // Newest first: away 3pt, home 2pt, then period start
    expect(items[0]?.textContent).toMatch(/Away 1/);
    expect(items[1]?.textContent).toMatch(/Home 1/);
  });

  it("describes a made 3pt with the 3PT tag", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordScore("home", players.homePlayer(0).id, "3pt", true);
    render(<GameLog />);
    expect(screen.getByText("3PT")).toBeInTheDocument();
    expect(screen.getByText(/scored 3/)).toBeInTheDocument();
  });

  it("describes a missed shot with the MISS tag", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordScore("home", players.homePlayer(0).id, "2pt", false);
    render(<GameLog />);
    expect(screen.getByText("MISS")).toBeInTheDocument();
    expect(screen.getByText(/missed 2/)).toBeInTheDocument();
  });

  it("describes a free throw made with FT tag", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordScore("home", players.homePlayer(0).id, "ft", true);
    render(<GameLog />);
    expect(screen.getByText("FT")).toBeInTheDocument();
  });

  it("describes a 2PT made with the 2PT tag", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordScore("home", players.homePlayer(0).id, "2pt", true);
    render(<GameLog />);
    expect(screen.getByText("2PT")).toBeInTheDocument();
  });

  it("describes a foul with FOUL tag", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordFoul("home", players.homePlayer(0).id, "personal");
    render(<GameLog />);
    expect(screen.getByText("FOUL")).toBeInTheDocument();
    expect(screen.getByText(/Personal foul/)).toBeInTheDocument();
  });

  it("describes a stat (e.g. assist) with no tag chip but with text", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordStat("home", players.homePlayer(0).id, "assist");
    render(<GameLog />);
    expect(screen.getByText(/Assist/)).toBeInTheDocument();
  });

  it("describes a substitution with SUB tag", () => {
    const players = seedReadyGame();
    addBench("home", 1);
    useGameStore.getState().startGame();
    const out = players.homePlayer(0);
    const bench = useGameStore
      .getState()
      .homeTeam.roster.find((p) => p.name === "Bench 1")!;
    useGameStore.getState().substitute("home", out.id, bench.id);
    render(<GameLog />);
    expect(screen.getByText("SUB")).toBeInTheDocument();
    expect(screen.getByText(/Sub:/)).toBeInTheDocument();
  });

  it("describes a timeout with TO tag", () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordTimeout("home");
    render(<GameLog />);
    expect(screen.getByText("TO")).toBeInTheDocument();
  });

  it("describes period start (TIP) and end (END)", () => {
    seedReadyGame();
    useGameStore.getState().startGame(); // period start
    useGameStore.getState().endPeriod();
    render(<GameLog />);
    expect(screen.getByText("TIP")).toBeInTheDocument();
    expect(screen.getByText("END")).toBeInTheDocument();
  });

  it("renders 'Clock start' / 'Clock stop' for clock events", () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().startClock();
    useGameStore.getState().stopClock();
    render(<GameLog />);
    expect(screen.getByText(/Clock start/)).toBeInTheDocument();
    expect(screen.getByText(/Clock stop/)).toBeInTheDocument();
  });

  it("renders a clock adjustment with from→to values and an ADJ tag distinct from start/stop", () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    // Inject a synthetic adjust event so we don't rely on the (paused-only)
    // adjustClock action mid-test.
    useGameStore.setState((s) => ({
      events: [
        ...s.events,
        {
          type: "clock",
          id: "adj-1",
          timestamp: Date.now(),
          period: 2,
          clockAt: 462,
          action: "adjust",
          from: 462,
          to: 465,
        },
      ],
    }));
    render(<GameLog />);
    // ADJ tag exists and is unique among clock entries (no chip on start/stop)
    expect(screen.getByText("ADJ")).toBeInTheDocument();
    // Both formatted times are rendered (mm:ss for >= 60 seconds)
    expect(screen.getByText(/07:42.*07:45/)).toBeInTheDocument();
  });

  it("shows Edit button on a score row", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordScore("home", players.homePlayer(0).id, "2pt", true);
    render(<GameLog />);
    expect(screen.getAllByRole("button", { name: /Edit play/ }).length).toBeGreaterThan(0);
  });

  it("shows Edit button on a foul row", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordFoul("home", players.homePlayer(0).id, "personal");
    render(<GameLog />);
    expect(screen.getAllByRole("button", { name: /Edit play/ }).length).toBeGreaterThan(0);
  });

  it("shows Edit button on a stat row", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordStat("home", players.homePlayer(0).id, "assist");
    render(<GameLog />);
    expect(screen.getAllByRole("button", { name: /Edit play/ }).length).toBeGreaterThan(0);
  });

  it("shows Edit button on a timeout row", () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordTimeout("home");
    render(<GameLog />);
    expect(screen.getAllByRole("button", { name: /Edit play/ }).length).toBeGreaterThan(0);
  });

  it("does NOT show Edit button on a substitution row", () => {
    const players = seedReadyGame();
    addBench("home", 1);
    useGameStore.getState().startGame();
    const out = players.homePlayer(0);
    const bench = useGameStore
      .getState()
      .homeTeam.roster.find((p) => p.name === "Bench 1")!;
    useGameStore.getState().substitute("home", out.id, bench.id);
    render(<GameLog />);
    // Only the period-start row exists before this — it should also not have an Edit button
    expect(screen.queryAllByRole("button", { name: /Edit play/ })).toHaveLength(0);
  });

  it("does NOT show Edit button on clock or period rows", () => {
    seedReadyGame();
    useGameStore.getState().startGame(); // period start
    useGameStore.getState().startClock();
    useGameStore.getState().stopClock();
    render(<GameLog />);
    expect(screen.queryAllByRole("button", { name: /Edit play/ })).toHaveLength(0);
  });

  it("clicking Edit on a score row opens the edit modal pre-filled", async () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordScore("home", players.homePlayer(0).id, "2pt", true);
    const user = userEvent.setup();
    render(<GameLog />);
    await user.click(screen.getByRole("button", { name: /Edit play/ }));
    // The edit modal renders a "Edit play" title and a Save button
    expect(screen.getAllByText(/Edit play/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Save/ })).toBeInTheDocument();
  });

  it("shows Delete button on a score row", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordScore("home", players.homePlayer(0).id, "2pt", true);
    render(<GameLog />);
    expect(screen.getAllByRole("button", { name: /Delete play/ }).length).toBeGreaterThan(0);
  });

  it("does NOT show Delete button on a substitution row", () => {
    const players = seedReadyGame();
    addBench("home", 1);
    useGameStore.getState().startGame();
    const out = players.homePlayer(0);
    const bench = useGameStore
      .getState()
      .homeTeam.roster.find((p) => p.name === "Bench 1")!;
    useGameStore.getState().substitute("home", out.id, bench.id);
    render(<GameLog />);
    expect(screen.queryAllByRole("button", { name: /Delete play/ })).toHaveLength(0);
  });

  it("clicking Delete on a foul row opens the delete confirm modal", async () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordFoul("home", players.homePlayer(0).id, "personal");
    const user = userEvent.setup();
    render(<GameLog />);
    await user.click(screen.getByRole("button", { name: /Delete play/ }));
    // Modal title is rendered
    expect(screen.getByText(/Delete play\?/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Delete$/ })).toBeInTheDocument();
  });

  it("falls back to 'Unknown' if the playerId no longer exists", () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    // Insert a synthetic event for a non-existent player
    useGameStore.setState((s) => ({
      events: [
        ...s.events,
        {
          type: "score",
          id: "fake",
          timestamp: Date.now(),
          period: 1,
          clockAt: 100,
          side: "home",
          playerId: "ghost",
          kind: "2pt",
          made: true,
        },
      ],
    }));
    render(<GameLog />);
    expect(screen.getByText(/Unknown/)).toBeInTheDocument();
  });
});
