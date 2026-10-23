import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { managementOverheadPpForCorp } from "./managementOverhead";

const id = new ObjectId();
const lookups = { managementOverheadPpByCorpId: new Map([[id.toString(), 4]]) };

describe("managementOverheadPpForCorp", () => {
  it("returns the group overhead for a private corporation", () => {
    expect(managementOverheadPpForCorp({ _id: id }, lookups)).toBe(4);
  });
  it("exempts state-owned corporations", () => {
    expect(managementOverheadPpForCorp({ _id: id, countryOwnerId: "US" }, lookups)).toBe(0);
  });
  it("cuts overhead for a levelled NPP CEO, capped at 2 points", () => {
    const npp = (level: number) => ({
      _id: id,
      ceoType: "npp" as const,
      ceoPay: { ceoId: "n", appointedTurn: 1, nextReviewTurn: 25, level },
    });
    expect(managementOverheadPpForCorp(npp(1), lookups)).toBe(4);
    expect(managementOverheadPpForCorp(npp(3), lookups)).toBeCloseTo(3.2);
    expect(managementOverheadPpForCorp(npp(10), lookups)).toBe(2);
  });
  it("ignores a stale level once a human runs the company", () => {
    expect(
      managementOverheadPpForCorp(
        {
          _id: id,
          ceoType: "character",
          ceoPay: { ceoId: "n", appointedTurn: 1, nextReviewTurn: 25, level: 10 },
        },
        lookups
      )
    ).toBe(4);
  });
});
