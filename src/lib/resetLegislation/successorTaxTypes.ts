/** Scottish and Welsh national tax instruments inherit UK legal rate ranges.
 * successorTaxTypes gives each independent legislature its own instrument IDs. */
import type { LegislationType } from "@/lib/db/types/legislation";
import { UK_LAWS } from "@/lib/countries/uk/data/ukLaws";
import { projectLawToLegislationType } from "@/lib/politicalLegislation/project";
import { expandIncomeTaxTypes } from "@/lib/budget/incomeTaxCatalog";

/** Independent instruments use inherited legal ranges, never the UK's budget or policy IDs. */
export const successorTaxTypes: LegislationType[] = expandIncomeTaxTypes(
  (["sco", "wls"] as const).flatMap((countryScope) =>
    UK_LAWS.filter((law) => law.kind === "tax").map((law) => {
      const projected = projectLawToLegislationType(law);
      return {
        ...projected,
        _id: law.id.replace("uk.", `${countryScope}.`),
        countryScope,
        administration: undefined,
        description: `National tax instrument for ${countryScope === "sco" ? "Scotland" : "Wales"}. Rates are set by its own legislature.`,
      };
    })
  )
);

/** Tier provisions inherit the era and cost classification of their base instrument. */
export const successorTaxInstrumentIds = [
  ...new Set(successorTaxTypes.map((type) => type._id.split(/__(?:income|capital)_/)[0]!)),
];
