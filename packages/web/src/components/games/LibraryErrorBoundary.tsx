"use client";

/**
 * Isolates render errors from the library section (feature 009-account-library,
 * FR-014). If `<GameLibrary>` — or any child — throws during render, this
 * boundary swaps in a retryable fallback surface while the surrounding
 * account page (profile section, etc.) keeps working.
 *
 * Kept as a class component because React still lacks a first-class hook
 * for error boundaries. No external dependency.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class LibraryErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Swallow — an app-level error reporter can be wired in as a follow-up.
  }

  private retry = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="panel p-6 flex flex-col items-start gap-3">
        <div>
          <h2 className="heading-display text-xl">Games</h2>
          <p className="text-sm text-ink-dim mt-1">
            We couldn&rsquo;t load your library right now.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={this.retry}>
          Retry
        </Button>
      </div>
    );
  }
}
