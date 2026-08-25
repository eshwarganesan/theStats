# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> US1: sign up >> a new visitor signs up and lands on / signed in
- Location: tests/e2e/auth.spec.ts:70:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - navigation "Primary" [ref=e2]:
    - button "Expand sidebar" [ref=e4] [cursor=pointer]:
      - img [ref=e5]
  - main [ref=e9]:
    - main [ref=e10]:
      - generic [ref=e12]:
        - generic [ref=e13]:
          - heading "Create your account" [level=2] [ref=e14]
          - paragraph [ref=e15]: Sign up to unlock sync, save, and multi-device features. You can keep scorekeeping anonymously without an account.
        - tablist "Authentication mode" [ref=e16]:
          - tab "Sign in" [ref=e17] [cursor=pointer]
          - tab "Sign up" [selected] [ref=e18] [cursor=pointer]
        - generic [ref=e19]:
          - generic [ref=e20]:
            - generic [ref=e21]: Email
            - textbox "Email" [ref=e22]: e2e-signup-1787637134254-po3k69@example.com
          - generic [ref=e23]:
            - generic [ref=e24]: Password
            - textbox "Password" [ref=e25]: password12345
          - alert [ref=e26]: Something went wrong.
          - button "Create account" [ref=e27] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e33] [cursor=pointer]:
    - img [ref=e34]
  - alert [ref=e37]
```