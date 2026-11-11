/**
 * Next.js middleware.
 *
 * It lives in `src/` because the app does: with `src/app`, Next.js only
 * loads `src/middleware.ts`. It sat at the package root until feature 018,
 * where Next.js never loaded it, so everything below was dormant until then.
 *
 * Two responsibilities layered on the same request:
 *
 *   1. Rotate the Supabase session cookie (feature 005 FR-008, 30-day
 *      sliding session). The `getAll`/`setAll` cookie adapter reproduces
 *      the pattern @supabase/ssr documents: build a fresh NextResponse
 *      whenever cookies are written so the rotated cookie lands on the
 *      response sent to the browser.
 *   2. Enforce the auth wall (feature 011 FR-006 / FR-007 / FR-008 /
 *      FR-009 / FR-012). Signed-out hits on protected pages bounce to
 *      `/login?from=<encoded pathname+search>`. Signed-in hits on the
 *      public landing (`/`) or the sign-in page (`/login`) bounce to
 *      `/games`. Everything else passes through. The 17-row response
 *      matrix in `specs/011-auth-gated-landing/contracts/middleware.md`
 *      is the source of truth; see `decideRoute` below for the pure
 *      version of the branching logic (unit-tested in `middleware.test.ts`).
 *   3. A session whose account was deleted (feature 018): its cookies are
 *      expired and any page request lands on `/?account=deleted-elsewhere`,
 *      rows 18–20 in `specs/018-account-deletion/contracts/account-gone-signals.md`
 *      (§2). API requests pass through; their handlers answer
 *      `401 account_deleted` themselves.
 *
 * The matcher excludes static assets so this cost is paid only on real
 * navigations / API calls.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { getPublicEnv } from "@/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Path prefixes that require an authenticated session. A path is
 * considered protected iff it equals one of these prefixes exactly OR
 * begins with `<prefix>/…`. Comparing against `<prefix>/` (not just
 * `startsWith(prefix)`) anchors on a path segment boundary so `/setups`
 * does not match `/setup` and `/gameboard` does not match `/game`.
 */
const PROTECTED_PREFIXES = [
  "/setup",
  "/game",
  "/games",
  "/account",
] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export type RoutingDecision =
  | { kind: "next" }
  | { kind: "redirect"; location: string };

/**
 * Pure routing decision given a URL and the verified Supabase session.
 * Exported for unit tests; the wrapper below translates the result into
 * an actual `NextResponse` and preserves rotated cookies on redirects.
 */
export function decideRoute(
  pathname: string,
  search: string,
  user: User | null,
): RoutingDecision {
  if (user) {
    if (pathname === "/" || pathname === "/login") {
      return { kind: "redirect", location: "/games" };
    }
    return { kind: "next" };
  }
  if (isProtectedPath(pathname)) {
    const from = encodeURIComponent(pathname + search);
    return { kind: "redirect", location: `/login?from=${from}` };
  }
  return { kind: "next" };
}

const DELETED_ELSEWHERE = "/?account=deleted-elsewhere";

/**
 * Where a page request goes when its session belongs to a deleted account,
 * or `null` to leave it alone: API requests (their handlers own the error
 * shape), and the notice page itself, so a cookie that somehow survives
 * can't cause a redirect loop.
 */
export function deletedAccountRedirect(pathname: string, search: string): string | null {
  if (pathname === "/api" || pathname.startsWith("/api/")) return null;
  if (pathname === "/" && new URLSearchParams(search).get("account") === "deleted-elsewhere") {
    return null;
  }
  return DELETED_ELSEWHERE;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getPublicEnv();
  const supabase = createSSRServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const redirectTo = (location: string) => {
    const target = new URL(location, request.nextUrl.origin);
    const redirect = NextResponse.redirect(target, 307);
    // Preserve any cookies the refresh (or sign-out) path stamped onto
    // `response` so the browser sees them on the redirect too.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  };

  // Verify the session (also triggers refresh-token rotation on this
  // request). We treat any non-null `error` as unauthenticated — same
  // convention feature 005 established in `requireAuth`.
  const { data, error } = await supabase.auth.getUser();

  // Supabase Auth answers `user_not_found` for a still-valid token whose
  // account was deleted (feature 018, research R5 / R7).
  if (error?.code === "user_not_found") {
    const location = deletedAccountRedirect(request.nextUrl.pathname, request.nextUrl.search);
    if (location) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // best effort: the redirect still shows the notice
      }
      return redirectTo(location);
    }
  }

  const user = error ? null : data.user;

  const decision = decideRoute(
    request.nextUrl.pathname,
    request.nextUrl.search,
    user,
  );

  if (decision.kind === "redirect") {
    return redirectTo(decision.location);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and the favicon. See
    // https://nextjs.org/docs/app/building-your-application/routing/middleware
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
