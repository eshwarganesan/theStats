/**
 * LibraryErrorBoundary tests.
 * Feature 009-account-library, task T036a. Enforces FR-014 — a failure
 * to render the library section MUST NOT blank out the surrounding
 * profile section.
 */
import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LibraryErrorBoundary } from "./LibraryErrorBoundary";

function Bomb(): React.ReactElement {
  throw new Error("library-load-failed");
}

// React 19 still logs "The above error occurred" via console.error when a
// child throws. Suppress it so the test output stays clean.
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
beforeAll(() => {
  errorSpy.mockClear();
});
afterAll(() => {
  errorSpy.mockRestore();
});

describe("LibraryErrorBoundary", () => {
  it("renders its children when they render successfully", () => {
    render(
      <LibraryErrorBoundary>
        <div>library ok</div>
      </LibraryErrorBoundary>,
    );
    expect(screen.getByText("library ok")).toBeInTheDocument();
  });

  it("shows a retryable fallback surface when a child throws", () => {
    render(
      <div>
        <div data-testid="profile-slot">profile section</div>
        <LibraryErrorBoundary>
          <Bomb />
        </LibraryErrorBoundary>
      </div>,
    );
    // Profile section still visible — enforcing FR-014.
    expect(screen.getByTestId("profile-slot")).toBeInTheDocument();
    // Library section shows the retryable fallback.
    expect(screen.getByText(/couldn.{0,3}t load your library/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
