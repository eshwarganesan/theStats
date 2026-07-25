/**
 * Review view for a finished game (feature 009-account-library, US4).
 *
 * Renders a read-only statsheet + game log for a saved game record.
 * No edit affordances anywhere in the tree (FR-020) — the underlying
 * GameLog is given `readOnly`, and the StatSheet is presentational.
 *
 * Composed of already-existing pure primitives (`StatSheet`,
 * `GameLog` with `readOnly` + `source` props), so the review view
 * itself has no side effects and is safe to render from a Server
 * Component page.
 */
import Link from "next/link";
import { computeStatSheet } from "@thestats/core";
import type { PersistedGameRecord } from "@/lib/persistence";
import { StatSheet } from "@/components/game/StatSheet";
import { GameLog } from "@/components/game/GameLog";

export interface GameReviewViewProps {
  record: PersistedGameRecord;
}

function formatScore(a: number, b: number): string {
  return `${a}–${b}`;
}

export function GameReviewView({ record }: GameReviewViewProps) {
  const sheet = computeStatSheet(
    record.events,
    record.homeTeam,
    record.awayTeam,
    record.settings,
    record.currentPeriod,
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="heading-display text-2xl">
            {record.homeTeam.name} vs {record.awayTeam.name}
          </h1>
          <span className="text-2xl font-mono text-ink">
            {formatScore(sheet.home.points, sheet.away.points)}
          </span>
        </div>
        <Link
          href="/account"
          className="text-xs text-ink-dim hover:text-accent w-fit"
        >
          &larr; Back to your library
        </Link>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="review-statsheet-heading">
        <h2 id="review-statsheet-heading" className="heading-display text-xl">
          Statsheet
        </h2>
        <StatSheet
          home={sheet.home}
          away={sheet.away}
          homeTeam={record.homeTeam}
          awayTeam={record.awayTeam}
          settings={record.settings}
        />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="review-log-heading">
        <h2 id="review-log-heading" className="heading-display text-xl">
          Play-by-play
        </h2>
        <div className="min-h-[400px]">
          <GameLog
            readOnly
            source={{
              events: record.events,
              homeTeam: record.homeTeam,
              awayTeam: record.awayTeam,
              periods: record.settings.periods,
            }}
          />
        </div>
      </section>
    </div>
  );
}
