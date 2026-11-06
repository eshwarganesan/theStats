import * as Crypto from "expo-crypto";

import { installCryptoPolyfill } from "./cryptoPolyfill";

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "00000000-0000-4000-8000-000000000000"),
  getRandomValues: jest.fn(),
}));

describe("installCryptoPolyfill", () => {
  it("adds randomUUID and getRandomValues where crypto is missing (Hermes)", () => {
    const target: Parameters<typeof installCryptoPolyfill>[0] = {};
    installCryptoPolyfill(target);

    expect(target.crypto?.randomUUID?.()).toBe("00000000-0000-4000-8000-000000000000");
    expect(target.crypto?.getRandomValues).toBe(Crypto.getRandomValues);
  });

  it("keeps an existing getRandomValues", () => {
    const getRandomValues = jest.fn();
    const target = { crypto: { getRandomValues } };
    installCryptoPolyfill(target);

    expect(target.crypto.getRandomValues).toBe(getRandomValues);
    expect(target.crypto).toHaveProperty("randomUUID", Crypto.randomUUID);
  });

  it("leaves a runtime that already has randomUUID alone", () => {
    const existing = { randomUUID: () => "native" };
    const target = { crypto: existing };
    installCryptoPolyfill(target);

    expect(target.crypto).toBe(existing);
  });
});
