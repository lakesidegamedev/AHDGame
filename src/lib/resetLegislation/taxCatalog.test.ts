import { expandIncomeTaxTypes } from "@/lib/budget/incomeTaxCatalog";
import { describe, expect, it } from "vitest";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import { getCabinetPositions } from "@/lib/constants/cabinetMechanics";
import { CA_LAWS } from "@/lib/countries/ca/data/caLaws";
import { US_LAWS } from "@/lib/countries/us/data/usLaws";
import { UK_LAWS } from "@/lib/countries/uk/data/ukLaws";
import { JP_LAWS } from "@/lib/countries/jp/data/jpLaws";
import { US_STATE_TAX_LAWS } from "@/lib/countries/us/data/usStateTaxLaws";
import { projectLawToLegislationType } from "@/lib/politicalLegislation/project";
import {
  resetTaxBaseTypeIds,
  resetTaxForLegislationType,
  resetTaxLegislationTypeIds,
  resetTaxes,
  resetTaxesFor,
  resetTaxesForWorld,
} from "./taxCatalog";

describe("reset tax instruments", () => {
  it("offers independent income and capital-gains tiers among fourteen exact-rate tax instruments", () => {
    expect(new Set(resetTaxes.map((tax) => tax.id)).size).toBe(14);
    const runtimeTypes = expandIncomeTaxTypes([
      ...legislationTypes,
      ...US_LAWS.map(projectLawToLegislationType),
      ...UK_LAWS.map(projectLawToLegislationType),
      ...JP_LAWS.map(projectLawToLegislationType),
      ...CA_LAWS.map(projectLawToLegislationType),
      ...US_STATE_TAX_LAWS.map(projectLawToLegislationType),
    ]);
    for (const tax of resetTaxes) {
      const existing = runtimeTypes.find((type) => type._id === tax.existingLegislationTypeId);
      expect(existing, `${tax.country} ${tax.scope} ${tax.id}`).toBeDefined();
      expect(existing?.taxRateChange?.taxType).toBe(tax.taxType);
      expect(existing?.taxRateChange?.scope).toBe(tax.scope === "national" ? "federal" : "state");
      if (tax.scope === "national") {
        expect(
          getCabinetPositions(tax.country).some((seat) => seat.id === tax.overseeingSeatId)
        ).toBe(true);
      } else {
        expect(tax.overseeingSeatId).toBeNull();
      }
    }
  });

  it("does not invent a 1991 UK regional tax fixture", () => {
    expect(resetTaxesFor("UK", "regional")).toEqual([]);
    expect(resetTaxesFor("JP", "regional").map((tax) => tax.id)).toEqual(["T08", "T09"]);
  });

  it("does not reuse UK tax instruments for successor-country budgets", () => {
    for (const country of ["SCO", "WAL"] as const) {
      const taxes = resetTaxesFor(country, "national");
      expect(taxes).toHaveLength(11);
      expect(
        taxes.every((tax) =>
          tax.existingLegislationTypeId.startsWith(country === "SCO" ? "sco." : "wls.")
        )
      ).toBe(true);
    }
  });
});

describe("Japanese tax instruments in worlds seeded before the law book", () => {
  const japan = resetTaxesFor("JP", "national");

  it("files each instrument under the old type id as well", () => {
    expect(resetTaxForLegislationType(japan, "jp_consumption_tax")?.id).toBe("T05");
    expect(resetTaxForLegislationType(japan, "jp.tax.salesTax")?.id).toBe("T05");
    expect(resetTaxForLegislationType(japan, "jp_income_tax_rate__income_low")).toBe(
      resetTaxForLegislationType(japan, "jp.tax.incomeTax__income_low")
    );
    expect(resetTaxForLegislationType(japan, "jp_income_tax_rate__capital_high")?.taxType).toBe(
      "capitalGainsTaxHigh"
    );
    expect(resetTaxLegislationTypeIds(japan)).toHaveLength(japan.length * 2);
  });

  it("offers the type the world holds", () => {
    const saved = resetTaxesForWorld(japan, new Set(["jp_customs_tariff", "jp_income_tax_rate"]));
    expect(saved.find((tax) => tax.id === "T06")?.existingLegislationTypeId).toBe(
      "jp_customs_tariff"
    );
    expect(saved.find((tax) => tax.id === "T01_low")?.existingLegislationTypeId).toBe(
      "jp_income_tax_rate__income_low"
    );
    const both = resetTaxesForWorld(japan, new Set(["jp_customs_tariff", "jp.tax.tariffs"]));
    expect(both.find((tax) => tax.id === "T06")?.existingLegislationTypeId).toBe("jp.tax.tariffs");
    expect(resetTaxesForWorld(japan, new Set())).toEqual(japan);
  });

  it("looks up base type ids only", () => {
    const ids = resetTaxBaseTypeIds(japan);
    expect(ids).toContain("jp_income_tax_rate");
    expect(ids).toContain("jp.tax.incomeTax");
    expect(ids.some((id) => id.includes("__"))).toBe(false);
  });

  it("gives no other country an alias", () => {
    expect(
      resetTaxes.filter((tax) => tax.country !== "JP" && tax.savedWorldLegislationTypeId)
    ).toEqual([]);
  });
});
