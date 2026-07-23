"use server";

/**
 * Server Actions for the account page (feature 009-account-library, US1).
 *
 * All actions verify the Supabase session at the boundary, Zod-validate
 * every input, and return the shared `ActionResult<T>` shape. See
 * `specs/009-account-library/contracts/server-actions.md`.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import {
  ChangePasswordSchema,
  UpdateDisplayNameSchema,
} from "@/lib/validation/profile";
import type { ProfileRow } from "@/lib/games/types";

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

async function requireSession() {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect("/login?from=/account");
  }
  return { supabase, user: data.user };
}

function rowToProfile(row: {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}): ProfileRow {
  return {
    id: row.id,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lazily create + fetch the caller's profile row. Called by the `/account`
 * Server Component on every render — first call creates the row (RLS
 * `INSERT` policy checks `id = auth.uid()`), subsequent calls return the
 * existing row.
 */
export async function ensureProfile(): Promise<ProfileRow> {
  const { supabase, user } = await requireSession();

  const upsertResult = await supabase
    .from("profiles")
    .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true })
    .select("id, display_name, created_at, updated_at")
    .single();

  if (upsertResult.data) {
    return rowToProfile(upsertResult.data);
  }

  // Upsert with ignoreDuplicates returns no row when the conflict path fires;
  // fall through to a plain read.
  const fetchResult = await supabase
    .from("profiles")
    .select("id, display_name, created_at, updated_at")
    .eq("id", user.id)
    .single();

  if (fetchResult.error || !fetchResult.data) {
    throw new Error("failed to load profile");
  }

  return rowToProfile(fetchResult.data);
}

/**
 * Update the caller's display name. Empty string clears the field to null.
 */
export async function updateDisplayName(
  formData: FormData,
): Promise<ActionResult<{ displayName: string | null }>> {
  const parsed = UpdateDisplayNameSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.code === "too_big") {
      return {
        ok: false,
        error: {
          code: "display_name_too_long",
          message: "Display name must be 64 characters or fewer.",
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "display_name_invalid",
        message: "Display name is not valid.",
      },
    };
  }

  const { supabase, user } = await requireSession();

  const result = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", user.id)
    .select("id, display_name, created_at, updated_at")
    .single();

  if (result.error || !result.data) {
    return {
      ok: false,
      error: {
        code: "profile_update_failed",
        message: "Could not save your changes. Please try again.",
      },
    };
  }

  revalidatePath("/account");
  return { ok: true, value: { displayName: result.data.display_name } };
}

/**
 * Change the caller's Supabase password. Requires the current password to
 * be re-entered and forwards Supabase's rejection reason verbatim if the
 * new password fails the provider's policy.
 */
export async function changePassword(
  formData: FormData,
): Promise<ActionResult<{ signedIn: true }>> {
  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    newPassword: formData.get("newPassword") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: "Both password fields are required.",
      },
    };
  }

  const { supabase, user } = await requireSession();

  // Step 1 — re-authenticate under the current password. On failure we
  // return the anti-enumeration wording from feature 005 (no distinction
  // between "wrong password" and "user missing").
  const reauth = await supabase.auth.signInWithPassword({
    email: user.email ?? "",
    password: parsed.data.currentPassword,
  });
  if (reauth.error) {
    return {
      ok: false,
      error: {
        code: "current_password_incorrect",
        message: "Current password is incorrect.",
      },
    };
  }

  // Step 2 — apply the new password. Supabase enforces the provider's
  // password policy; on rejection we surface its message verbatim (feature
  // 005 pattern) so the user sees exactly what to fix.
  const update = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (update.error) {
    return {
      ok: false,
      error: {
        code: "new_password_rejected",
        message: update.error.message,
      },
    };
  }

  revalidatePath("/account");
  return { ok: true, value: { signedIn: true } };
}
