import type { SVGProps } from "react";

/**
 * Inline chevron-right glyph. Used on the sidebar expand control.
 * No dependency on an icon library (Research R-10).
 */
export function IconChevronRight(props: SVGProps<SVGSVGElement>) {
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
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}
