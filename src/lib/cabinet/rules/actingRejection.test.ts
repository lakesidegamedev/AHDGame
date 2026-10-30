import { describe, expect, it } from "vitest";
import { actingRejectionScope } from "./actingRejection";

describe("actingRejectionScope", () => {
  it("starts a fresh rejection window at the current presidency's seating", () => {
    const start = new Date("2026-10-30T00:00:00Z");
    expect(actingRejectionScope(start)).toEqual({
      proposedAt: { $gte: start },
      rejectionReason: { $ne: "incompatible_bank_office" },
    });
  });

  it("keeps legacy undated presidencies queryable without inventing a start date", () => {
    expect(actingRejectionScope(null)).toEqual({
      rejectionReason: { $ne: "incompatible_bank_office" },
    });
  });
});
