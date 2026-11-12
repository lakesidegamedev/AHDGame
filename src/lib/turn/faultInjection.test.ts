import { afterEach, describe, expect, it } from "vitest";
import {
  armTurnFault,
  describeTurnError,
  maybeInjectTurnFault,
  parseTurnFaultSpec,
} from "./faultInjection";

afterEach(() => armTurnFault(null));

describe("parseTurnFaultSpec", () => {
  it("parses phase, substep and once", () => {
    expect(parseTurnFaultSpec("bondTurn")).toEqual({
      phase: "bondTurn",
      substep: null,
      once: false,
      stop: false,
    });
    expect(parseTurnFaultSpec("bondTurn:once")).toEqual({
      phase: "bondTurn",
      substep: null,
      once: true,
      stop: false,
    });
    expect(parseTurnFaultSpec("corporationTurn:payroll:once")).toEqual({
      phase: "corporationTurn",
      substep: "payroll",
      once: true,
      stop: false,
    });
    expect(parseTurnFaultSpec("bondTurn:stop:once")).toMatchObject({
      phase: "bondTurn",
      substep: null,
      once: true,
      stop: true,
    });
  });
  it("rejects empty and malformed specs", () => {
    expect(parseTurnFaultSpec("")).toBeNull();
    expect(parseTurnFaultSpec(undefined)).toBeNull();
    expect(parseTurnFaultSpec("a:b:c")).toBeNull();
  });
});

describe("maybeInjectTurnFault", () => {
  it("does nothing when unarmed or for other phases", () => {
    expect(() => maybeInjectTurnFault("bondTurn", null)).not.toThrow();
    armTurnFault(parseTurnFaultSpec("bondTurn"));
    expect(() => maybeInjectTurnFault("fundGeneration", null)).not.toThrow();
    expect(() => maybeInjectTurnFault("bondTurn", "x")).not.toThrow();
  });
  it("throws every time without once, a single time with it", () => {
    armTurnFault(parseTurnFaultSpec("bondTurn"));
    expect(() => maybeInjectTurnFault("bondTurn", null)).toThrow(/Injected fault/);
    expect(() => maybeInjectTurnFault("bondTurn", null)).toThrow(/Injected fault/);
    armTurnFault(parseTurnFaultSpec("bondTurn:once"));
    expect(() => maybeInjectTurnFault("bondTurn", null)).toThrow(/Injected fault/);
    expect(() => maybeInjectTurnFault("bondTurn", null)).not.toThrow();
  });
});

describe("describeTurnError", () => {
  it("keeps the message and the first stack frames", () => {
    const text = describeTurnError(new Error("boom"), 2);
    const lines = text.split("\n");
    expect(lines[0]).toBe("boom");
    expect(lines.length).toBe(3);
    expect(lines[1]).toMatch(/^at /);
  });
  it("stringifies non-errors", () => {
    expect(describeTurnError("plain")).toBe("plain");
  });
});
