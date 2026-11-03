import { describe, expect, it } from "vitest";
import {
  buildResetLawProvenance,
  buildResetLawRecord,
  resetLawPolicyDomain,
  type ResetLawProgramRow,
} from "./resetLawRecords";

const row: ResetLawProgramRow = {
  familyId: "L17",
  familyTitle: "Care affordability and prices",
  choice: "center_left",
  titleSnapshot: "Essential Care Cost Cap",
  descriptionSnapshot: "Cap patient charges.",
  effectiveTurn: 535,
  enactedByBillId: "bill-1",
  billTitle: "New Deal Bill",
  enactedAt: new Date("2026-10-30T06:23:41Z"),
  enactedYear: 1993,
};

describe("reset law statute rows", () => {
  it("files a care law under healthcare", () => {
    expect(resetLawPolicyDomain("L17")).toBe("healthcare");
    expect(resetLawPolicyDomain("L37")).toBe("agriculture");
    expect(resetLawPolicyDomain("L99")).toBe("governance");
  });

  it("maps a program to a policy row with its title, choice, turn and bill", () => {
    const record = buildResetLawRecord(row);
    expect(record).toMatchObject({
      legislationTypeId: "resetLaw:L17",
      policyDomain: "healthcare",
      policyOptionName: "Essential Care Cost Cap",
      hasEconomic: false,
      hasSocial: false,
      enactedByBillId: "bill-1",
    });
    expect(record.detailText).toContain("turn 535");
  });

  it("feeds last enacted through provenance keyed by the row id", () => {
    const provenance = buildResetLawProvenance([row, { ...row, familyId: "L24", enactedAt: null }]);
    expect(Object.keys(provenance)).toEqual(["resetLaw:L17"]);
    expect(provenance["resetLaw:L17"]).toMatchObject({ title: "New Deal Bill", enactedYear: 1993 });
  });
});
