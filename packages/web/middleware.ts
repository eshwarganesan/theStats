/**
 * Next.js middleware — refreshes the Supabase session cookie on every
 * request, satisfying FR-008 (30-day sliding session) automatically and
 * giving every Server Component / Route Handler a fresh auth state to
 * read.
 *
 * Per the @supabase/ssr docs: the `setAll` branch creates a fresh
 * NextResponse each time so the rotated cookie lands on the response sent
 * back to the browser. The matcher excludes static assets so this cost is
 * paid only on real navigations / API calls.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/env";
import type { Database } from "@/lib/supabase/database.types";

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

  // Touch the session so refresh-token rotation fires on this request.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and the favicon. See
    // https://nextjs.org/docs/app/building-your-application/routing/middleware
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
