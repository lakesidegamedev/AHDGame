import { describe, expect, it } from "vitest";
import { isShortInputRow, shortInputState } from "./shortInput";

const args = (over: Partial<Parameters<typeof shortInputState>[0]> = {}) => ({
  throughputBinding: null,
  throttleApplied: null,
  capacityUnits: 100,
  idleCauses: [] as { cause: "inputs"; units: number; bindingInput?: string }[],
  ...over,
});

describe("shortInputState", () => {
  it("falls back to the run receipt's input when the throttle names none", () => {
    const s = shortInputState(
      args({ idleCauses: [{ cause: "inputs", units: 40, bindingInput: "iron" }] })
    );
    expect(s).toMatchObject({ commodity: "iron", idleShare: 0.4, showsCallout: true });
    expect(s.unknownWhich).toBe(false);
  });
  it("prefers the throttle's input when both exist", () => {
    const s = shortInputState(
      args({
        throughputBinding: "coal",
        idleCauses: [{ cause: "inputs", units: 40, bindingInput: "iron" }],
      })
    );
    expect(s.commodity).toBe("coal");
  });
  it("says it is unknown when inputs idled capacity and nothing names the input", () => {
    const s = shortInputState(args({ idleCauses: [{ cause: "inputs", units: 40 }] }));
    expect(s).toMatchObject({ commodity: null, showsCallout: false, unknownWhich: true });
  });
  it("flags nothing for a projected input with no idle capacity and no applied throttle", () => {
    const s = shortInputState(args({ throughputBinding: "iron" }));
    expect(s.showsCallout).toBe(false);
    expect(s.unknownWhich).toBe(false);
    expect(isShortInputRow(s, "iron", 0)).toBe(false);
  });
});

describe("isShortInputRow", () => {
  it("flags only the named commodity once inputs idled capacity", () => {
    const s = shortInputState(
      args({ idleCauses: [{ cause: "inputs", units: 0.001, bindingInput: "iron" }] })
    );
    expect(isShortInputRow(s, "iron", 0.001)).toBe(true);
    expect(isShortInputRow(s, "coal", 0.001)).toBe(false);
  });
});
