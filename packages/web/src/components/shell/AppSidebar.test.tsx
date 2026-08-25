/**
 * AppSidebar tests.
 * Feature 009-account-library, task T012.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppSidebar, SIDEBAR_STORAGE_KEY } from "./AppSidebar";

/**
 * Simple in-memory localStorage stub — the test env may already provide
 * one, but we want deterministic behavior per test.
 */
function stubLocalStorage() {
  let store: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = String(v);
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        store = {};
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    },
  });
}

/** Force matchMedia to a specific result for the collapse-default query. */
function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  stubLocalStorage();
});

describe("AppSidebar", () => {
  it("renders the profile slot at the bottom", () => {
    stubMatchMedia(true);
    render(
      <AppSidebar profileIcon={<div data-testid="profile-icon">profile</div>} />,
    );
    expect(screen.getByTestId("profile-icon")).toBeInTheDocument();
  });

  it("defaults to collapsed (rail-first) on desktop viewports", () => {
    stubMatchMedia(true);
    render(<AppSidebar profileIcon={<span>profile</span>} />);
    const nav = screen.getByRole("navigation");
    expect(nav).toHaveAttribute("data-collapsed", "true");
  });

  it("defaults to collapsed on mobile viewports (matchMedia does not match)", () => {
    stubMatchMedia(false);
    render(<AppSidebar profileIcon={<span>profile</span>} />);
    const nav = screen.getByRole("navigation");
    expect(nav).toHaveAttribute("data-collapsed", "true");
  });

  it("toggles collapsed state on button click and persists it to localStorage", () => {
    stubMatchMedia(true);
    render(<AppSidebar profileIcon={<span>profile</span>} />);
    // Starts collapsed (rail-first): first click expands.
    const button = screen.getByRole("button", { name: /collapse|expand/i });
    fireEvent.click(button);
    expect(screen.getByRole("navigation")).toHaveAttribute(
      "data-collapsed",
      "false",
    );
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe(
      JSON.stringify(false),
    );

    fireEvent.click(screen.getByRole("button", { name: /expand|collapse/i }));
    expect(screen.getByRole("navigation")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe(
      JSON.stringify(true),
    );
  });

  it("restores persisted expanded state from localStorage on mount", () => {
    stubMatchMedia(true);
    // Persisted expanded overrides the rail-first collapsed default.
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(false));
    render(<AppSidebar profileIcon={<span>profile</span>} />);
    expect(screen.getByRole("navigation")).toHaveAttribute(
      "data-collapsed",
      "false",
    );
  });
});
