/**
 * Whether an account still exists (feature 018-account-deletion, research
 * R6), behind GET /api/account/status. A device whose session already
 * expired asks this about the account it was signed in to.
 *
 * Service-role justification (Constitution Principle VI): only Supabase's
 * admin API can look a user up by id. The answer is one boolean about a
 * random UUID, and the lookup reads nothing else. See plan.md,
 * Complexity Tracking.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** True or false, or null when Auth couldn't answer. */
export async function accountExists(userId: string): Promise<boolean | null> {
  const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
  if (!error) return data.user !== null;
  if (error.status === 404 || error.code === "user_not_found") return false;
  return null;
}
