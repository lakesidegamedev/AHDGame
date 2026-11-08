import type { CountryId } from "@/lib/constants/countries";
import type { RegionalBudget } from "@/lib/db/types/regionalBudget";
import { JP_REGIONAL_GRANT_FIELD } from "@/lib/countries/jp/economy";

/**
 * Maps country to its `regionalBudgets` grant field. `RegionalBudget` carries
 * one grant field per country family, so a lookup returning `undefined` for an
 * unmapped country is intentional: it must never silently fall back to another
 * country's field (that hid DD's Länder grants) and a new country shows as
 * absent rather than zero.
 */
const REGIONAL_GRANT_FIELD: Partial<
  Record<
    CountryId,
    | "nationalGrant"
    | "federalEqualizationGrant"
    | "centralTransferGrant"
    | "westminsterGrant"
    | "unionGrant"
  >
> = {
  JP: JP_REGIONAL_GRANT_FIELD,
  DE: "federalEqualizationGrant",
  CN: "centralTransferGrant",
  DD: "federalEqualizationGrant",
  UK: "westminsterGrant",
  RU: "unionGrant",
};

/**
 * The grant this region actually received, or `undefined` when the country has
 * no mapped grant field (as opposed to a mapped field holding zero — callers
 * that want to fall back to `stateBudgets.revenue.federalGrants` need to tell
 * those two apart).
 */
export function regionalGrantAmount(
  countryId: CountryId,
  regionalBudget: RegionalBudget | undefined
): number | undefined {
  const field = REGIONAL_GRANT_FIELD[countryId];
  if (!field || !regionalBudget) return undefined;
  return regionalBudget[field] ?? 0;
}
