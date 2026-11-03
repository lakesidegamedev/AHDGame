/**
 * Repeated organization building. quoteOrganizationBatch prices each requested
 * build at its own pressure step, using the existing PS and treasury formulas.
 */
import type { CountryId } from "@/lib/constants/countriesCore";
import {
  BUILD_ORG_BASE_PS_COST,
  effectivePsCost,
  PRESSURE_LADDER_INCREMENT,
  PRESSURE_LADDER_MAX_VALUE,
} from "@/lib/politicalStrength/strengthConstants";
import {
  orgBuildCashPrice,
  type OrgBuildFundingScope,
} from "@/lib/politicalStrength/buildOrgFunding";

export function quoteOrganizationBatch(input: {
  countryId: CountryId;
  scope: OrgBuildFundingScope;
  pressure: number;
  count: number;
  sizeMultiplier: number;
}) {
  let pressure = input.pressure;
  let psCost = 0;
  let cashPrice = 0;
  for (let i = 0; i < input.count; i++) {
    const cost = effectivePsCost(BUILD_ORG_BASE_PS_COST, pressure);
    psCost += cost;
    cashPrice += orgBuildCashPrice(input.countryId, input.scope, cost, input.sizeMultiplier);
    pressure = Math.min(PRESSURE_LADDER_MAX_VALUE, pressure + PRESSURE_LADDER_INCREMENT);
  }
  return { psCost, cashPrice };
}
