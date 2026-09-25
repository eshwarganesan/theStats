/**
 * Root layout composition test.
 *
 * After feature 011 restructures layout ownership (see plan.md R2), the
 * root layout MUST NOT render <AppSidebar> or apply the pl-14 sidebar
 * inset — those responsibilities move into (authenticated)/layout.tsx.
 * The root layout keeps HTML shell + fonts + <StorageAvailabilityProvider>
 * only, so public pages (landing, login, auth callback) render without
 * the app chrome (spec FR-002 / FR-011).
 *
 * Note: rendering a Next.js RootLayout in isolation is unusual because it
 * returns <html>/<body>. We suppress hydration mismatches by rendering
 * into a detached container; the assertions target structural class
 * presence, not full DOM parity.
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// next/font/google is a build-time compiler primitive that returns
// pre-generated font objects at production build; in JSDOM it's not
// callable. Mock each import used by the root layout with a shape that
// matches the runtime contract (an object exposing `variable` and
// `className`) so importing layout.tsx does not throw at module init.
vi.mock("next/font/google", () => {
  const fake = () => ({ variable: "--font-mock", className: "font-mock" });
  return {
    Bebas_Neue: fake,
    Manrope: fake,
    JetBrains_Mono: fake,
  };
});

import RootLayout from "./layout";

describe("root app/layout", () => {
  it("does not render the app sidebar", () => {
    const { container } = render(
      <RootLayout>
        <div data-testid="child" />
      </RootLayout>,
      {
        // The root layout returns <html><body>…</body></html>, which is
        // invalid inside the default JSDOM <body>. Render into a detached
        // container so React does not complain, and query on that.
        container: document.createElement("div"),
      },
    );
    expect(
      container.querySelector('nav[aria-label="Primary"]'),
    ).toBeNull();
  });

  it("does not apply the pl-14 sidebar inset on <main>", () => {
    const { container } = render(
      <RootLayout>
        <div data-testid="child" />
      </RootLayout>,
      { container: document.createElement("div") },
    );
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.className.split(/\s+/)).not.toContain("pl-14");
  });
});
