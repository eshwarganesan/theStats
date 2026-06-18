import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { NewGameButton } from "@/components/home/NewGameButton";

export default function HomePage() {
  return (
    <main className="min-h-[100dvh] flex flex-col">
      {/* Top bar */}
      <header className="h-14 flex items-center justify-between px-5 md:px-8 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-accent" aria-hidden />
          <span className="heading-display text-xl tracking-wide">CourtLog</span>
        </div>
        <span className="label-eyebrow hidden md:inline">
          Digital Scoresheet · v0.1
        </span>
      </header>

      {/* Hero */}
      <section className="flex-1 grid lg:grid-cols-[1.2fr,1fr]">
        <div className="relative p-8 md:p-16 flex flex-col justify-center overflow-hidden">
          {/* Decorative background numerals */}
          <div
            className="absolute inset-0 pointer-events-none select-none"
            aria-hidden
          >
            <span className="absolute -top-4 -left-4 font-display text-[18rem] leading-none text-accent/[0.04]">
              24
            </span>
            <span className="absolute bottom-10 right-0 font-display text-[14rem] leading-none text-accent/[0.04]">
              48
            </span>
          </div>

          <div className="relative max-w-xl animate-slide-up">
            <p className="label-eyebrow mb-4">A scorekeeper&apos;s instrument</p>
            <h1 className="heading-display text-5xl md:text-7xl leading-[0.9]">
              Every Bucket.
              <br />
              <span className="text-accent">Every Whistle.</span>
              <br />
              Digitised.
            </h1>
            <p className="mt-6 text-ink-muted text-base md:text-lg max-w-lg leading-relaxed">
              A paperless, real-time scoresheet for basketball. Track scores,
              fouls, substitutions and statistics with a single tap. Built for
              tablets courtside.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <NewGameButton size="xl" variant="primary">
                New Game →
              </NewGameButton>
              <Link href="/game">
                <Button size="xl" variant="outline">
                  Continue Game
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Right: feature callouts */}
        <aside className="border-t lg:border-t-0 lg:border-l border-surface-border p-8 md:p-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-0 lg:gap-0 content-start">
          <Feature
            index="01"
            title="Live Statistics"
            body="Full box score derived in real time. Points, rebounds, assists, steals, blocks, fouls — all from one tap per action."
          />
          <Feature
            index="02"
            title="Frame-accurate Clock"
            body="requestAnimationFrame-driven game clock. Period management, overtime, buzzer, all handled."
          />
          <Feature
            index="03"
            title="Event-Sourced Undo"
            body="Every action is an event. Mistaps are reverted instantly without breaking the record."
          />
          <Feature
            index="04"
            title="3v3 & 5v5"
            body="Switch format to get the right rules. Timeouts, foul-out thresholds and period structure adapt."
          />
        </aside>
      </section>

      <footer className="px-5 md:px-8 h-10 flex items-center justify-between border-t border-surface-border">
        <span className="label-eyebrow">Frontend-only replica</span>
        <span className="label-eyebrow">No data persisted yet</span>
      </footer>
    </main>
  );
}

function Feature({
  index,
  title,
  body,
}: {
  index: string;
  title: string;
  body: string;
}) {
  return (
    <div className="py-6 first:pt-0 lg:border-b border-surface-border/60 last:border-b-0">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-mono text-xs text-accent tabular">{index}</span>
        <span className="h-px bg-surface-border flex-1" aria-hidden />
      </div>
      <h3 className="heading-display text-xl mb-1">{title}</h3>
      <p className="text-sm text-ink-muted leading-relaxed">{body}</p>
    </div>
  );
}
