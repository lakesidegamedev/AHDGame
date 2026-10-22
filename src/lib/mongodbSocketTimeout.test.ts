import { describe, expect, it } from "vitest";
import { DEFAULT_MONGODB_SOCKET_TIMEOUT_MS, resolveMongoSocketTimeoutMs } from "./mongodb";

describe("resolveMongoSocketTimeoutMs", () => {
  it("keeps the 60s web default when unset or invalid", () => {
    expect(resolveMongoSocketTimeoutMs({})).toBe(DEFAULT_MONGODB_SOCKET_TIMEOUT_MS);
    expect(resolveMongoSocketTimeoutMs({ MONGODB_SOCKET_TIMEOUT_MS: "abc" })).toBe(60_000);
    expect(resolveMongoSocketTimeoutMs({ MONGODB_SOCKET_TIMEOUT_MS: "0" })).toBe(60_000);
  });
  it("uses the worker's override", () => {
    expect(resolveMongoSocketTimeoutMs({ MONGODB_SOCKET_TIMEOUT_MS: "300000" })).toBe(300_000);
  });
  it("clamps to 10s..15min", () => {
    expect(resolveMongoSocketTimeoutMs({ MONGODB_SOCKET_TIMEOUT_MS: "500" })).toBe(10_000);
    expect(resolveMongoSocketTimeoutMs({ MONGODB_SOCKET_TIMEOUT_MS: "99999999" })).toBe(900_000);
  });
});
