/**
 * Public surface of @thestats/app.
 *
 * Platform-neutral client layer — the game store, the persistence
 * contract, API validation schemas, and library helpers. Consumed by the
 * web app and the iOS app; anything touching `window`, `document`, or a
 * native module stays in the platform package.
 */
export * from "./store";
export * from "./persistence";
export * from "./validation/games";
export * from "./validation/profile";
export * from "./validation/account";
export * from "./api/errors";
export * from "./account/notices";
export * from "./account/deleteAccount";
export * from "./account/status";
export * from "./games/types";
export * from "./games/serialize";
export * from "./games/idempotency";
export * from "./games/writeThrough";
export * from "./games/describeEvent";
export * from "./games/events";
