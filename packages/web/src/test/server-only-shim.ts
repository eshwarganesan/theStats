// In production builds, Next.js's bundler aliases `import "server-only"` to
// a module that throws when imported by client code. Vitest's jsdom env
// presents as a browser, so the real `server-only` package throws on
// import even inside server-side test files. We point the alias at this
// no-op for tests so server modules (admin.ts, server.ts, route handlers)
// can be imported by integration tests.
//
// The production `server-only` guarantee still holds — Next's bundler
// uses the real package, this shim is only resolved when @ is the vitest
// resolver.
export {};
