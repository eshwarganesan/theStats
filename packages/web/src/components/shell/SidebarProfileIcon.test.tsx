/**
 * SidebarProfileIcon tests.
 * Feature 009-account-library, task T013.
 *
 * SidebarProfileIcon is an async Server Component. In the component test we
 * mock `createServerClient` to control the auth state, then `await` the
 * component invocation to get its resolved JSX and render it.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from "@/lib/supabase/server";
import { SidebarProfileIcon } from "./SidebarProfileIcon";

const mockedCreate = vi.mocked(createServerClient);

function fakeSupabase(user: { id: string; email: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: "no session" },
      }),
    },
  } as unknown as Awaited<ReturnType<typeof createServerClient>>;
}

describe("SidebarProfileIcon", () => {
  it("does not render when unauthenticated", async () => {
    mockedCreate.mockResolvedValue(fakeSupabase(null));
    const jsx = await SidebarProfileIcon();
    const { container } = render(jsx);
    expect(container.firstChild).toBeNull();
  });

  it("renders an accessible link to /account when signed in", async () => {
    mockedCreate.mockResolvedValue(
      fakeSupabase({ id: "user-1", email: "u@example.com" }),
    );
    const jsx = await SidebarProfileIcon();
    render(jsx);
    const link = screen.getByRole("link", { name: /account/i });
    expect(link).toHaveAttribute("href", "/account");
  });
});
