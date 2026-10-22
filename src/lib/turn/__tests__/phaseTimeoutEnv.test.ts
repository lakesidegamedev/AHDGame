import { describe, expect, it } from "vitest";
import { resolvePhaseTimeoutMs } from "@/lib/turn/processingLock";

describe("resolvePhaseTimeoutMs", () => {
  it("defaults to four minutes when unset or invalid", () => {
    expect(resolvePhaseTimeoutMs(undefined)).toBe(240_000);
    expect(resolvePhaseTimeoutMs("")).toBe(240_000);
    expect(resolvePhaseTimeoutMs("abc")).toBe(240_000);
    expect(resolvePhaseTimeoutMs("-5")).toBe(240_000);
  });
  it("uses a configured value inside the allowed range", () => {
    expect(resolvePhaseTimeoutMs("1200000")).toBe(1_200_000);
  });
  it("clamps to one minute and thirty minutes", () => {
    expect(resolvePhaseTimeoutMs("1000")).toBe(60_000);
    expect(resolvePhaseTimeoutMs("99999999")).toBe(1_800_000);
  });
});
