import { describe, expect, it } from "vitest";
import legislationTypes from "@/lib/seeds/reference/legislationTypes";
import {
  OLD_CATALOGUE_LAW_IDS,
  isOldCatalogueLawId,
  oldCatalogueIdsWithin,
} from "./oldCatalogueIds";

describe("retired catalogue ids", () => {
  it("covers every compatibility table", () => {
    for (const id of [
      "us_federal_education_funding",
      "de_minimum_wage",
      "cn_ai_strategy",
      "jp_minimum_wage",
    ]) {
      expect([id, isOldCatalogueLawId(id)]).toEqual([id, true]);
    }
    expect(isOldCatalogueLawId("us.education.universalSchooling.primary")).toBe(false);
    expect(isOldCatalogueLawId(undefined)).toBe(false);
  });

  it("no seeded law type is a retired id, or the scan would fail every fresh reset", () => {
    const clash = legislationTypes
      .map((type) => type._id)
      .filter((id) => OLD_CATALOGUE_LAW_IDS.has(id));
    expect(clash).toEqual([]);
  });

  it("finds retired ids nested anywhere in a document value", () => {
    expect(
      oldCatalogueIdsWithin({
        primary: { lawTypeId: "de_minimum_wage" },
        secondary: [{ lawTypeId: "de.tax.income" }, { lawTypeId: "cn_ai_strategy" }],
      })
    ).toEqual(["cn_ai_strategy", "de_minimum_wage"]);
  });
});
