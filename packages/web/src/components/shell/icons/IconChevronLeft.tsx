import type { SVGProps } from "react";

/**
 * Inline chevron-left glyph. Used on the sidebar collapse control.
 * No dependency on an icon library (Research R-10).
 */
export function IconChevronLeft(props: SVGProps<SVGSVGElement>) {
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
      <polyline points="15 6 9 12 15 18" />
    </svg>
  );
}
