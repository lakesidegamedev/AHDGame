import { describe, expect, it } from "vitest";
import { decideCentralLogin, parseCentralLoginMode, shadowMatches } from "./rules";

describe("parseCentralLoginMode", () => {
  it("defaults to off", () => {
    expect(parseCentralLoginMode(undefined)).toBe("off");
    expect(parseCentralLoginMode("")).toBe("off");
    expect(parseCentralLoginMode("on")).toBe("off");
    expect(parseCentralLoginMode("Central ")).toBe("central");
    expect(parseCentralLoginMode("shadow")).toBe("shadow");
  });
});

describe("decideCentralLogin", () => {
  it("accepts only ok", () => {
    expect(decideCentralLogin("ok")).toEqual({ action: "accept" });
  });
  it("rejects definite negative answers without fallback", () => {
    for (const outcome of ["wrong", "disabled", "unknown"] as const) {
      expect(decideCentralLogin(outcome)).toEqual({ action: "reject" });
    }
  });
  it("falls back to the local check on error or timeout only", () => {
    expect(decideCentralLogin("error")).toEqual({ action: "fallback-local" });
    expect(decideCentralLogin("timeout")).toEqual({ action: "fallback-local" });
  });
});

describe("shadowMatches", () => {
  it("compares the central answer with the local decision", () => {
    expect(shadowMatches("ok", "ok")).toBe(true);
    expect(shadowMatches("ok", "wrong")).toBe(false);
    expect(shadowMatches("wrong", "wrong")).toBe(true);
    expect(shadowMatches("wrong", "ok")).toBe(false);
    expect(shadowMatches("wrong", "unknown")).toBe(false);
    expect(shadowMatches("ok", "error")).toBe(false);
    expect(shadowMatches("wrong", "timeout")).toBe(false);
  });
});
