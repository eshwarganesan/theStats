/**
 * Zod schemas used at the Route Handler boundary, per Constitution Principle
 * VI ("Every Route Handler MUST validate the request body using a schema
 * validator (Zod) at the top of the handler").
 *
 * Per Clarification Q2 / research.md R5: NO project-level password policy.
 * The auth provider's default policy is the only rule. Schemas here enforce
 * only structural validity (non-empty, valid email format, open-redirect
 * guard on `next`).
 */
import { z } from "zod";

const emailField = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().email());

const passwordField = z.string().min(1, "Password is required");

// Open-redirect guard: `next` must be a relative path beginning with a
// single forward slash. Rejects absolute URLs (`https://evil.com`) and
// protocol-relative URLs (`//evil.com`).
const nextField = z
  .string()
  .max(512)
  .regex(/^\/(?!\/)/, "next must be a relative path beginning with /")
  .optional();

export const signUpInput = z.object({
  email: emailField,
  password: passwordField,
  next: nextField,
});

export const signInInput = z.object({
  email: emailField,
  password: passwordField,
  next: nextField,
});

export const resendInput = z.object({
  email: emailField,
});

export type SignUpInput = z.infer<typeof signUpInput>;
export type SignInInput = z.infer<typeof signInInput>;
export type ResendInput = z.infer<typeof resendInput>;
