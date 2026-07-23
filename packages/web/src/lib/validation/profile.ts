/**
 * Zod schemas for the account-page Server Actions (feature 009-account-library).
 *
 * Consumed by `packages/web/src/app/(authenticated)/account/actions.ts`. Follows
 * feature 005's precedent of deferring password policy to the Supabase provider
 * — no project-level rules on `newPassword` here beyond structural non-empty.
 */
import { z } from "zod";

/**
 * Display name update. An empty string collapses to `null` (the user's
 * affordance to clear their display name). Trailing whitespace is trimmed.
 * The 64-character cap is enforced at the boundary; the DB column is
 * untyped-length `text` to keep future changes cheap.
 */
export const UpdateDisplayNameSchema = z.object({
  displayName: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(64, "Display name must be 64 characters or fewer."))
    .transform((v) => (v.length === 0 ? null : v)),
});

export type UpdateDisplayNameInput = z.infer<typeof UpdateDisplayNameSchema>;

/**
 * Password change. Both fields must be non-empty; the Supabase provider is
 * the source of truth for password policy — the server action forwards the
 * new password to `updateUser` and surfaces the provider's rejection reason
 * verbatim if any (matching feature 005's FR-003 pattern).
 */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(1, "New password is required."),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
