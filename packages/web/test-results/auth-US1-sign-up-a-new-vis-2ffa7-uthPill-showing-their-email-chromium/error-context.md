# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> US1: sign up >> a new visitor signs up and lands on / with the AuthPill showing their email
- Location: tests/e2e/auth.spec.ts:70:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Sign in" [ref=e2] [cursor=pointer]:
    - /url: /login
  - main [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - heading "Create your account" [level=2] [ref=e7]
        - paragraph [ref=e8]: Sign up to unlock sync, save, and multi-device features. You can keep scorekeeping anonymously without an account.
      - tablist "Authentication mode" [ref=e9]:
        - tab "Sign in" [ref=e10] [cursor=pointer]
        - tab "Sign up" [selected] [ref=e11] [cursor=pointer]
      - generic [ref=e12]:
        - generic [ref=e13]:
          - generic [ref=e14]: Email
          - textbox "Email" [ref=e15]: e2e-signup-1782776974695-e44n7w@example.com
        - generic [ref=e16]:
          - generic [ref=e17]: Password
          - textbox "Password" [ref=e18]: password12345
        - alert [ref=e19]: Too many attempts. Please try again shortly.
        - button "Create account" [ref=e20] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e26] [cursor=pointer]:
    - img [ref=e27]
  - alert [ref=e30]
```