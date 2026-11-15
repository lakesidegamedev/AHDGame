import { describe, expect, it } from "vitest";
import {
  probeWindowStart,
  buildStepPreview,
  judgeStepWrites,
  previewTokenInput,
  stepsNeedingRepairConfirmation,
} from "./holdPreview";

const found = (label: string, count: number, sums: Record<string, number> = {}) =>
  ({ label, status: "found", count, sums }) as const;
const unknown = (label: string) =>
  ({ label, status: "unknown", reason: "audit log is off" }) as const;

describe("judgeStepWrites", () => {
  it("is some when any probe found rows", () => {
    expect(judgeStepWrites([found("audit", 0), found("tx", 3)], true)).toBe("some");
  });
  it("is unknown when a probe could not run", () => {
    expect(judgeStepWrites([unknown("audit")], true)).toBe("unknown");
  });
  it("is none-found only for a step with its own probes that all ran empty", () => {
    expect(judgeStepWrites([found("audit", 0), found("tx", 0)], true)).toBe("none-found");
    expect(judgeStepWrites([found("audit", 0)], false)).toBe("unknown");
  });
});

describe("token", () => {
  it("changes when a count changes and ignores step order", () => {
    const a = buildStepPreview("bondTurn", [found("audit", 2, { amount: 5 })], true);
    const b = buildStepPreview("treasuryTurn", [found("audit", 0)], true);
    const t1 = previewTokenInput(3, [a, b]);
    expect(previewTokenInput(3, [b, a])).toBe(t1);
    const a2 = buildStepPreview("bondTurn", [found("audit", 3, { amount: 5 })], true);
    expect(previewTokenInput(3, [a2, b])).not.toBe(t1);
    expect(previewTokenInput(4, [a, b])).not.toBe(t1);
  });
});

describe("stepsNeedingRepairConfirmation", () => {
  it("lists money steps with writes or unknown, not clean ones", () => {
    const steps = [
      buildStepPreview("bondTurn", [found("audit", 4)], true),
      buildStepPreview("treasuryTurn", [found("audit", 0)], true),
      buildStepPreview("pensionTurn", [unknown("audit")], false),
    ];
    expect(stepsNeedingRepairConfirmation(steps)).toEqual(["bondTurn", "pensionTurn"]);
  });
});

describe("probeWindowStart", () => {
  const t = (iso: string) => new Date(iso);
  it("prefers the step's own start, then the first step start, then the lock start", () => {
    const statuses = {
      a: { startedAt: t("2027-01-01T10:00:00Z") },
      bondTurn: { startedAt: t("2027-01-01T10:05:00Z") },
      c: { startedAt: null },
    };
    expect(probeWindowStart(statuses, "bondTurn")).toEqual(t("2027-01-01T10:05:00Z"));
    expect(probeWindowStart(statuses, "c")).toEqual(t("2027-01-01T10:00:00Z"));
    expect(probeWindowStart({}, "x", t("2027-01-01T09:00:00Z"))).toEqual(t("2027-01-01T09:00:00Z"));
  });
  it("is null when nothing is known", () => {
    expect(probeWindowStart(null, "x")).toBeNull();
    expect(probeWindowStart({ x: { startedAt: "not a date" } }, "x")).toBeNull();
  });
});
