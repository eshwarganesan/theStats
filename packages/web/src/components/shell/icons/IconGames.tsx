import type { SVGProps } from "react";

/**
 * Inline glyph for the sidebar "Games" nav item (feature 010-games-library).
 * No icon-library dependency; matches the visual weight of the existing
 * IconUser / IconChevron* siblings.
 */
export function IconGames(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      width={20}
      height={20}
      {...props}
    >
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <line x1="12" y1="6" x2="12" y2="18" />
      <circle cx="7.5" cy="12" r="1.25" />
      <line x1="15" y1="12" x2="19" y2="12" />
      <line x1="17" y1="10" x2="17" y2="14" />
    </svg>
  );
}
