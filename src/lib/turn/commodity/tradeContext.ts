import { COUNTRY_ORDER } from "@/lib/constants/countries";
import { isCurtained } from "@/lib/constants/commandEconomy";
import type { OrganizationMembership } from "@/lib/db/types/internationalOrganization";

/** countryId -> set of org-bloc ids, for trade affinity. */
export function buildBlocsByCountry(
  orgMembershipDocs: Pick<OrganizationMembership, "countryId" | "organizationId">[]
): Map<string, Set<string>> {
  const blocsByCountry = new Map<string, Set<string>>();
  for (const m of orgMembershipDocs) {
    if (!m.countryId || !m.organizationId) continue;
    if (!blocsByCountry.has(m.countryId)) blocsByCountry.set(m.countryId, new Set());
    blocsByCountry.get(m.countryId)!.add(String(m.organizationId));
  }
  return blocsByCountry;
}

/**
 * Iron curtain: planned economies trade only among themselves until real
 * east-west trade mechanics exist. Membership derives from
 * MARKETIZATION_SCHEDULE via isCurtained, so the curtain lifts
 * country-by-country on historical dates, with the Tito-split exemption
 * keeping Yugoslavia in the open world.
 */
export function buildCurtainedCountries(
  ledgerCurrentYear: number | null,
  ledgerCommandEconomyEnabled: boolean
): Set<string> {
  return new Set<string>(
    COUNTRY_ORDER.filter((c) => isCurtained(c, ledgerCurrentYear, ledgerCommandEconomyEnabled))
  );
}
