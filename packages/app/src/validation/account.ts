/**
 * Zod schemas for the account-deletion endpoints (feature 018-account-deletion).
 *
 * Consumed by `POST /api/account/delete` and `GET /api/account/status` in
 * `packages/web`. Like feature 005, there's no password policy here: the
 * auth provider checks the password itself, so only the shape is enforced.
 */
import { z } from "zod";

/** Body of `POST /api/account/delete`. The account is always the caller's own. */
export const DeleteAccountBodySchema = z.object({
  password: z.string().min(1, "Password is required.").max(1024),
});

export type DeleteAccountBody = z.infer<typeof DeleteAccountBodySchema>;

/** Query of `GET /api/account/status`. */
export const AccountStatusQuerySchema = z.object({
  userId: z.string().uuid(),
});

export type AccountStatusQuery = z.infer<typeof AccountStatusQuerySchema>;
