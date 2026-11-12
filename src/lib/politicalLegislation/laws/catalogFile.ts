import type { LawCountryId, PoliticalLaw } from "@/lib/politicalLegislation/types";

function isLawRecord(value: unknown, countryId: LawCountryId): value is PoliticalLaw {
  if (value === null || typeof value !== "object") return false;
  const law = value as Record<string, unknown>;
  return (
    typeof law.id === "string" &&
    law.id.startsWith(`${countryId.toLowerCase()}.`) &&
    law.countryId === countryId &&
    typeof law.kind === "string" &&
    typeof law.title === "string" &&
    Array.isArray(law.targets)
  );
}

/**
 * Reads an authored law book from its JSON file. The shape check is cheap and
 * runs on load; the full rules live in `validateCatalog`, which each country's
 * catalog test runs against the same list.
 */
export function lawsFromJson(raw: unknown, countryId: LawCountryId): PoliticalLaw[] {
  if (!Array.isArray(raw) || !raw.every((law) => isLawRecord(law, countryId))) {
    throw new Error(`${countryId} law catalog JSON is malformed`);
  }
  return raw;
}
