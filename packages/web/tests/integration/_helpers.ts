/**
 * Helpers shared by the integration suites in every folder.
 */
import { randomBytes } from "node:crypto";

/**
 * A simulated client address for `x-forwarded-for`, so the request's
 * per-IP throttle key (`ip:<addr>`) is its own.
 *
 * Each wrong password locks its keys for 1–30 seconds (`record_auth_attempt`,
 * migration 0001), and test files run in parallel against one
 * `auth_attempts` table. So the address space has to be large: with the
 * 254 addresses of 203.0.113.0/24, a request could land on one that
 * another test had just locked, and get a 429. These are 96 random bits
 * under the IPv6 documentation prefix (2001:db8::/32).
 *
 * The TCP source IP that Supabase Auth sees is still shared. Its own
 * per-IP limits are raised in `supabase/config.toml`.
 */
export function uniqueIp(): string {
  const hex = randomBytes(12).toString("hex");
  const groups = Array.from({ length: 6 }, (_, i) => hex.slice(i * 4, i * 4 + 4));
  return `2001:db8:${groups.join(":")}`;
}
