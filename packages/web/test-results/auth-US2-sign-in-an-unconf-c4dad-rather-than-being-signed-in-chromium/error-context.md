# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> US2: sign in >> an unconfirmed user is shown a resend CTA rather than being signed in
- Location: tests/e2e/auth.spec.ts:149:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /resend confirmation/i })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: /resend confirmation/i })

```

```yaml
- link "Sign in":
  - /url: /login
- main:
  - heading "Sign in to theStats" [level=2]
  - paragraph: Sign in to your account to sync games, save play-by-play, and access them across devices.
  - tablist "Authentication mode":
    - tab "Sign in" [selected]
    - tab "Sign up"
  - text: Email
  - textbox "Email": e2e-unconfirmed-1782776976791-0dirs8@example.com
  - text: Password
  - textbox "Password": password12345
  - button "Sign in"
- alert
```

# Test source

```ts
  66  |   }
  67  | });
  68  | 
  69  | test.describe("US1: sign up", () => {
  70  |   test("a new visitor signs up and lands on / with the AuthPill showing their email", async ({
  71  |     page,
  72  |   }) => {
  73  |     const email = uniqueEmail();
  74  |     try {
  75  |       await page.goto("/login");
  76  |       await page.getByRole("tab", { name: /sign up/i }).click();
  77  |       await page.getByLabel(/email/i).fill(email);
  78  |       await page.getByLabel(/password/i).fill("password12345");
  79  |       await page.getByRole("button", { name: /create account/i }).click();
  80  | 
  81  |       await page.waitForURL("/");
  82  |       await expect(page.getByText(email)).toBeVisible();
  83  |       await expect(page.getByText(/pending confirmation/i)).toBeVisible();
  84  | 
  85  |       // Confirm the account via the admin API to simulate the user clicking
  86  |       // the email link (Mailpit isn't available in cloud-only setups).
  87  |       const { data } = await admin().auth.admin.listUsers({ page: 1, perPage: 200 });
  88  |       const user = data.users.find((u) => u.email === email);
  89  |       expect(user).toBeDefined();
  90  |       await admin().auth.admin.updateUserById(user!.id, { email_confirm: true });
  91  | 
  92  |       await page.reload();
  93  |       await expect(page.getByText(email)).toBeVisible();
  94  |       await expect(page.getByText(/pending confirmation/i)).toHaveCount(0);
  95  |     } finally {
  96  |       await deleteUserByEmail(email);
  97  |     }
  98  |   });
  99  | 
  100 |   test("an already-signed-in user visiting /login is redirected to /", async ({ page: _page }) => {
  101 |     const email = uniqueEmail("e2e-signed-in");
  102 |     try {
  103 |       // Seed: create a confirmed user.
  104 |       const { data: created } = await admin().auth.admin.createUser({
  105 |         email,
  106 |         password: "password12345",
  107 |         email_confirm: true,
  108 |       });
  109 |       expect(created.user).toBeDefined();
  110 | 
  111 |       // Sign in via the (yet-to-exist) sign-in endpoint OR — for US1 only —
  112 |       // skip; this scenario is covered by US2's E2E once sign-in lands.
  113 |       test.skip(true, "Deferred to US2: requires the sign-in flow");
  114 |     } finally {
  115 |       await deleteUserByEmail(email);
  116 |     }
  117 |   });
  118 | });
  119 | 
  120 | test.describe("US2: sign in", () => {
  121 |   test("a confirmed user signs in via the panel toggle and lands on /", async ({ page }) => {
  122 |     const email = uniqueEmail("e2e-signin");
  123 |     try {
  124 |       await admin().auth.admin.createUser({
  125 |         email,
  126 |         password: "password12345",
  127 |         email_confirm: true,
  128 |       });
  129 | 
  130 |       await page.goto("/login");
  131 |       // Default mode is sign-in for US2; ensure we're on the right tab.
  132 |       await page.getByRole("tab", { name: /sign in/i }).click();
  133 |       await page.getByLabel(/email/i).fill(email);
  134 |       await page.getByLabel(/password/i).fill("password12345");
  135 |       await page.getByRole("button", { name: /^sign in$/i }).click();
  136 | 
  137 |       await page.waitForURL("/");
  138 |       await expect(page.getByText(email)).toBeVisible();
  139 |       await expect(page.getByText(/pending confirmation/i)).toHaveCount(0);
  140 | 
  141 |       // Session survives a hard reload (FR-008).
  142 |       await page.reload();
  143 |       await expect(page.getByText(email)).toBeVisible();
  144 |     } finally {
  145 |       await deleteUserByEmail(email);
  146 |     }
  147 |   });
  148 | 
  149 |   test("an unconfirmed user is shown a resend CTA rather than being signed in", async ({
  150 |     page,
  151 |   }) => {
  152 |     const email = uniqueEmail("e2e-unconfirmed");
  153 |     try {
  154 |       await admin().auth.admin.createUser({
  155 |         email,
  156 |         password: "password12345",
  157 |         email_confirm: false,
  158 |       });
  159 | 
  160 |       await page.goto("/login");
  161 |       await page.getByRole("tab", { name: /sign in/i }).click();
  162 |       await page.getByLabel(/email/i).fill(email);
  163 |       await page.getByLabel(/password/i).fill("password12345");
  164 |       await page.getByRole("button", { name: /^sign in$/i }).click();
  165 | 
> 166 |       await expect(page.getByRole("button", { name: /resend confirmation/i })).toBeVisible();
      |                                                                                ^ Error: expect(locator).toBeVisible() failed
  167 |       // We did NOT land on /; the URL stays on /login because the session
  168 |       // was never established (FR-005).
  169 |       expect(page.url()).toContain("/login");
  170 |     } finally {
  171 |       await deleteUserByEmail(email);
  172 |     }
  173 |   });
  174 | });
  175 | 
  176 | test.describe("US3: sign out + account-gate", () => {
  177 |   test("anonymous deep-link to /account redirects to /login?from=%2Faccount; signed-in deep-link renders", async ({
  178 |     page,
  179 |   }) => {
  180 |     const email = uniqueEmail("e2e-gate");
  181 |     try {
  182 |       await admin().auth.admin.createUser({
  183 |         email,
  184 |         password: "password12345",
  185 |         email_confirm: true,
  186 |       });
  187 | 
  188 |       // Anonymous deep link → redirect to login carrying the destination.
  189 |       await page.goto("/account");
  190 |       await page.waitForURL((url) => url.pathname === "/login");
  191 |       expect(page.url()).toContain("from=%2Faccount");
  192 | 
  193 |       // Sign in via the same page.
  194 |       await page.getByRole("tab", { name: /sign in/i }).click();
  195 |       await page.getByLabel(/email/i).fill(email);
  196 |       await page.getByLabel(/password/i).fill("password12345");
  197 |       await page.getByRole("button", { name: /^sign in$/i }).click();
  198 | 
  199 |       // After sign-in we should be returned to the originally requested
  200 |       // screen (the page reads `from` from searchParams and redirects).
  201 |       await page.waitForURL("/account");
  202 |       await expect(page.getByText(/signed in as/i)).toBeVisible();
  203 |       await expect(page.getByRole("main").getByText(email)).toBeVisible();
  204 |     } finally {
  205 |       await deleteUserByEmail(email);
  206 |     }
  207 |   });
  208 | 
  209 |   test("sign-out reverts the app to anonymous mode and blocks subsequent access to /account", async ({
  210 |     page,
  211 |   }) => {
  212 |     const email = uniqueEmail("e2e-signout");
  213 |     try {
  214 |       await admin().auth.admin.createUser({
  215 |         email,
  216 |         password: "password12345",
  217 |         email_confirm: true,
  218 |       });
  219 | 
  220 |       await page.goto("/login");
  221 |       await page.getByRole("tab", { name: /sign in/i }).click();
  222 |       await page.getByLabel(/email/i).fill(email);
  223 |       await page.getByLabel(/password/i).fill("password12345");
  224 |       await page.getByRole("button", { name: /^sign in$/i }).click();
  225 |       await page.waitForURL("/");
  226 | 
  227 |       // Sign out from the AuthPill.
  228 |       await page.getByRole("button", { name: /sign out/i }).click();
  229 |       await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  230 | 
  231 |       // Anonymous screens still load (`/` is anonymous-accessible per the
  232 |       // hybrid mode clarification).
  233 |       await page.goto("/");
  234 |       await expect(page).toHaveURL("/");
  235 | 
  236 |       // But /account now redirects to /login again.
  237 |       await page.goto("/account");
  238 |       await page.waitForURL((url) => url.pathname === "/login");
  239 |     } finally {
  240 |       await deleteUserByEmail(email);
  241 |     }
  242 |   });
  243 | });
  244 | 
```