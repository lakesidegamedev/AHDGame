import { describe, expect, it } from "vitest";
import { DEFECTS, getDefect } from "../registry";
import { DEFECT_ID, defect } from "./AHD-sovereign-maturity-stranded-payout";

describe("AHD-sovereign-maturity-stranded-payout registration", () => {
  it("is registered", () => {
    expect(getDefect(DEFECT_ID)).toBe(defect);
    expect(DEFECTS.filter((d) => d.id === DEFECT_ID)).toHaveLength(1);
  });

  it("is gated on the merged #4754 fix", () => {
    expect(defect.codeFix?.requiredCommit).toBe("115dc01265eec5b8a259099daeccb29bd664b88b");
  });
});
