import { useState } from "react";

/**
 * `value`, or while it's null the last non-null value it had. Lets a sheet
 * keep showing its content while it animates closed.
 */
export function useLatest<T>(value: T | null): T | null {
  const [latest, setLatest] = useState<T | null>(value);
  if (value !== null && value !== latest) setLatest(value);
  return value ?? latest;
}
