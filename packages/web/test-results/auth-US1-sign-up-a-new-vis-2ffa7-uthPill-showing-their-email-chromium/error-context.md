# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> US1: sign up >> a new visitor signs up and lands on / with the AuthPill showing their email
- Location: tests/e2e/auth.spec.ts:58:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Sign in" [ref=e2] [cursor=pointer]:
    - /url: /login
  - main [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - heading "Sign in to theStats" [level=2] [ref=e7]
        - paragraph [ref=e8]: Sign in to your account to sync games, save play-by-play, and access them across devices.
      - tablist "Authentication mode" [ref=e9]:
        - tab "Sign in" [selected] [ref=e10] [cursor=pointer]
        - tab "Sign up" [ref=e11] [cursor=pointer]
      - generic [ref=e12]:
        - generic [ref=e13]:
          - generic [ref=e14]: Email
          - textbox "Email" [ref=e15]: e2e-signup-1780785589787-6lrgyz@example.com
        - generic [ref=e16]:
          - generic [ref=e17]: Password
          - textbox "Password" [active] [ref=e18]: password12345
        - button "Sign in" [ref=e19] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e25] [cursor=pointer]:
    - img [ref=e26]
  - alert [ref=e29]
```