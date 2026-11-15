import {
  INCOME_TIERS,
  INCOME_TAX_KEYS,
  INCOME_TIER_LABELS,
} from "@/lib/budget/rules/incomeTaxTiers";
/**
 * The reset tax menu retains the existing tax instruments. Tax bills choose an
 * exact percentage; ideological law levels never substitute for a tax rate.
 * UK 1991 regional council/property taxation needs a historical fixture and
 * is deliberately not offered through this menu yet.
 */
import type { ResetCountry } from "./fundingOwner";
import { CAPITAL_GAINS_TAX_KEYS } from "@/lib/budget/rules/capitalGainsTax";

export type TaxScope = "national" | "regional";
export type ResetTaxType =
  | "incomeTax"
  | "incomeTaxLow"
  | "incomeTaxMiddle"
  | "incomeTaxHigh"
  | "capitalGainsTaxLow"
  | "capitalGainsTaxMiddle"
  | "capitalGainsTaxHigh"
  | "domesticCorporateTax"
  | "foreignCorporateTax"
  | "payrollTax"
  | "salesTax"
  | "tariffs"
  | "propertyTax"
  | "residentTax"
  | "fixedAssetTax";

export interface ResetTaxDefinition {
  id: string;
  title: string;
  taxType: ResetTaxType;
  country: ResetCountry;
  scope: TaxScope;
  existingLegislationTypeId: string;
  /**
   * The type that carried this instrument in worlds seeded before the country
   * moved to its law book. Those worlds hold no document for the book type.
   */
  savedWorldLegislationTypeId?: string;
  overseeingSeatId: string | null;
}

const federal: ReadonlyArray<[string, string, ResetTaxType, string, string, string]> = [
  ["T01", "Income tax", "incomeTax", "us.tax.incomeTax", "uk.tax.incomeTax", "jp.tax.incomeTax"],
  [
    "T02",
    "Domestic corporate tax",
    "domesticCorporateTax",
    "us.tax.domesticCorporateTax",
    "uk.tax.domesticCorporateTax",
    "jp.tax.domesticCorporateTax",
  ],
  [
    "T03",
    "Foreign corporate tax",
    "foreignCorporateTax",
    "us.tax.foreignCorporateTax",
    "uk.tax.foreignCorporateTax",
    "jp.tax.foreignCorporateTax",
  ],
  [
    "T04",
    "Payroll tax",
    "payrollTax",
    "us.tax.payrollTax",
    "uk.tax.payrollTax",
    "jp.tax.payrollTax",
  ],
  [
    "T05",
    "Sales or consumption tax",
    "salesTax",
    "us.tax.salesTax",
    "uk.tax.salesTax",
    "jp.tax.salesTax",
  ],
  ["T06", "Tariffs", "tariffs", "us.tax.tariffs", "uk.tax.tariffs", "jp.tax.tariffs"],
];

const JP_SAVED_WORLD_TAX_TYPE: Readonly<Record<string, string>> = {
  T01: "jp_income_tax_rate",
  T02: "jp_domestic_corporation_tax",
  T03: "jp_foreign_corporation_tax",
  T04: "jp_social_insurance",
  T05: "jp_consumption_tax",
  T06: "jp_customs_tariff",
};

const treasurySeat: Record<ResetCountry, string> = {
  US: "secretary_of_treasury",
  CA: "minister_of_finance",
  UK: "chancellor",
  JP: "finance_minister",
  IE: "minister_for_finance",
  SCO: "financeSecretary",
  WAL: "financeSecretary",
};

const nationalTaxes: ResetTaxDefinition[] = federal.flatMap(([id, title, taxType, us, uk, jp]) => [
  {
    id,
    title,
    taxType,
    country: "US",
    scope: "national",
    existingLegislationTypeId: us,
    overseeingSeatId: treasurySeat.US,
  },
  {
    id,
    title,
    taxType,
    country: "UK",
    scope: "national",
    existingLegislationTypeId: uk,
    overseeingSeatId: treasurySeat.UK,
  },
  {
    id,
    title,
    taxType,
    country: "JP",
    scope: "national",
    existingLegislationTypeId: jp,
    savedWorldLegislationTypeId: JP_SAVED_WORLD_TAX_TYPE[id],
    overseeingSeatId: treasurySeat.JP,
  },
  {
    id,
    title,
    taxType,
    country: "IE",
    scope: "national",
    existingLegislationTypeId: (
      {
        T01: "ie_income_tax_rate",
        T02: "ie_corporate_tax_rate",
        T03: "ie_foreign_corporate_tax_rate",
        T04: "ie_prsi",
        T05: "ie_vat_rate",
        T06: "ie_customs_tariff_rate",
      } as const
    )[id as "T01" | "T02" | "T03" | "T04" | "T05" | "T06"],
    overseeingSeatId: treasurySeat.IE,
  },
]);
nationalTaxes.push(
  ...federal.map(([id, title, taxType]) => ({
    id,
    title,
    taxType,
    country: "CA" as const,
    scope: "national" as const,
    existingLegislationTypeId: `ca.tax.${taxType}`,
    overseeingSeatId: treasurySeat.CA,
  }))
);

const DEVOLVED_LAW_PREFIX = { SCO: "sco.", WAL: "wls." } as const;

nationalTaxes.push(
  ...federal.flatMap(([id, title, taxType, , uk]) =>
    (["SCO", "WAL"] as const).map((country) => ({
      id,
      title,
      taxType,
      country,
      scope: "national" as const,
      existingLegislationTypeId: uk.replace("uk.", DEVOLVED_LAW_PREFIX[country]),
      overseeingSeatId: treasurySeat[country],
    }))
  )
);
nationalTaxes.push({
  id: "T07",
  title: "Local property tax",
  taxType: "propertyTax",
  country: "IE",
  scope: "national",
  existingLegislationTypeId: "ie_local_property_tax",
  overseeingSeatId: treasurySeat.IE,
});

const regionalTaxes: ResetTaxDefinition[] = [
  {
    id: "T01",
    title: "Income tax",
    taxType: "incomeTax",
    country: "US",
    scope: "regional",
    existingLegislationTypeId: "us.tax.stateIncomeTax",
    overseeingSeatId: null,
  },
  {
    id: "T02",
    title: "Domestic corporate tax",
    taxType: "domesticCorporateTax",
    country: "US",
    scope: "regional",
    existingLegislationTypeId: "us.tax.stateDomesticCorporateTax",
    overseeingSeatId: null,
  },
  {
    id: "T03",
    title: "Foreign corporate tax",
    taxType: "foreignCorporateTax",
    country: "US",
    scope: "regional",
    existingLegislationTypeId: "us.tax.stateForeignCorporateTax",
    overseeingSeatId: null,
  },
  {
    id: "T05",
    title: "Sales tax",
    taxType: "salesTax",
    country: "US",
    scope: "regional",
    existingLegislationTypeId: "us.tax.stateSalesTax",
    overseeingSeatId: null,
  },
  {
    id: "T07",
    title: "Property tax",
    taxType: "propertyTax",
    country: "US",
    scope: "regional",
    existingLegislationTypeId: "us.tax.statePropertyTax",
    overseeingSeatId: null,
  },
  {
    id: "T08",
    title: "Resident tax",
    taxType: "residentTax",
    country: "JP",
    scope: "regional",
    existingLegislationTypeId: "jp_resident_tax",
    overseeingSeatId: null,
  },
  {
    id: "T09",
    title: "Fixed-asset tax",
    taxType: "fixedAssetTax",
    country: "JP",
    scope: "regional",
    existingLegislationTypeId: "jp_fixed_asset_tax",
    overseeingSeatId: null,
  },
];

export const resetTaxes: readonly ResetTaxDefinition[] = [
  ...nationalTaxes,
  ...regionalTaxes,
].flatMap((tax) =>
  tax.taxType === "incomeTax"
    ? INCOME_TIERS.flatMap((tier) => [
        {
          ...tax,
          id: tax.id + "_" + tier,
          title: INCOME_TIER_LABELS[tier] + " Tax",
          taxType: INCOME_TAX_KEYS[tier],
          existingLegislationTypeId: tax.existingLegislationTypeId + "__income_" + tier,
          ...(tax.savedWorldLegislationTypeId && {
            savedWorldLegislationTypeId: tax.savedWorldLegislationTypeId + "__income_" + tier,
          }),
        },
        {
          ...tax,
          id: tax.id + "_capital_" + tier,
          title: INCOME_TIER_LABELS[tier] + " Capital Gains Tax",
          taxType: CAPITAL_GAINS_TAX_KEYS[tier],
          existingLegislationTypeId: tax.existingLegislationTypeId + "__capital_" + tier,
          ...(tax.savedWorldLegislationTypeId && {
            savedWorldLegislationTypeId: tax.savedWorldLegislationTypeId + "__capital_" + tier,
          }),
        },
      ])
    : [tax]
);

export function resetTaxesFor(
  country: ResetCountry,
  scope: TaxScope
): readonly ResetTaxDefinition[] {
  return resetTaxes.filter((tax) => tax.country === country && tax.scope === scope);
}

/** The instrument a legislation type files, under either of its type ids. */
export function resetTaxForLegislationType(
  taxes: readonly ResetTaxDefinition[],
  legislationTypeId: string
): ResetTaxDefinition | undefined {
  return taxes.find(
    (tax) =>
      tax.existingLegislationTypeId === legislationTypeId ||
      tax.savedWorldLegislationTypeId === legislationTypeId
  );
}

/** Every type id that can file one of these instruments. */
export function resetTaxLegislationTypeIds(taxes: readonly ResetTaxDefinition[]): string[] {
  return taxes.flatMap((tax) =>
    tax.savedWorldLegislationTypeId
      ? [tax.existingLegislationTypeId, tax.savedWorldLegislationTypeId]
      : [tax.existingLegislationTypeId]
  );
}

const baseTypeId = (id: string) => id.split(/__(?:income|capital)_/)[0];

/**
 * Point each instrument at the type this world holds: the book type when it
 * exists, else the saved-world type when that exists.
 */
export function resetTaxesForWorld(
  taxes: readonly ResetTaxDefinition[],
  presentTypeIds: ReadonlySet<string>
): ResetTaxDefinition[] {
  return taxes.map((tax) => {
    const saved = tax.savedWorldLegislationTypeId;
    if (
      !saved ||
      presentTypeIds.has(baseTypeId(tax.existingLegislationTypeId)) ||
      !presentTypeIds.has(baseTypeId(saved))
    ) {
      return tax;
    }
    return { ...tax, existingLegislationTypeId: saved };
  });
}

/** Base legislation type ids to look up before {@link resetTaxesForWorld}. */
export function resetTaxBaseTypeIds(taxes: readonly ResetTaxDefinition[]): string[] {
  return [...new Set(resetTaxLegislationTypeIds(taxes).map(baseTypeId))];
}
