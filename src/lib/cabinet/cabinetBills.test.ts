import { describe, expect, it } from "vitest";
import { proposeCabinetBillSchema } from "./cabinetBills";

describe("proposeCabinetBillSchema", () => {
  it("fills defaults for optional fields", () => {
    const parsed = proposeCabinetBillSchema.parse({ title: "Roads Act", summary: "Fix roads" });
    expect(parsed.fullText).toBe("");
    expect(parsed.category).toBe("general");
    expect(parsed.effectDirection).toBe(0);
    expect(parsed.provisions).toBeUndefined();
  });

  it("rejects a missing title", () => {
    expect(proposeCabinetBillSchema.safeParse({ summary: "Fix roads" }).success).toBe(false);
  });
});
