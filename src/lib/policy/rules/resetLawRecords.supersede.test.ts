import { describe, expect, it } from "vitest";
import { dropSupersededLegacyRecords } from "./resetLawRecords";

describe("dropSupersededLegacyRecords", () => {
  const records = [
    { legislationTypeId: "us.sec.immigrationNationality" },
    { legislationTypeId: "us.tax.domesticCorporateTax" },
  ];
  it("removes a standing statute that an enacted reset law replaced", () => {
    const out = dropSupersededLegacyRecords(records, [
      { supersededSourceIds: ["us.sec.immigrationNationality"] },
    ]);
    expect(out).toEqual([{ legislationTypeId: "us.tax.domesticCorporateTax" }]);
  });
  it("keeps everything when nothing was superseded", () => {
    expect(dropSupersededLegacyRecords(records, [{}])).toHaveLength(2);
  });
});
