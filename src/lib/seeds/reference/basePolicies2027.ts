/**
 * SEED INDEPENDENCE — DO NOT DERIVE FROM ANOTHER ERA.
 * Each era seed is self-contained. This file MUST NOT import and transform
 * another era's seed data (e.g. the 2019 COUNTRY_POLICY_CONFIGS). Values are
 * projected independently for January 2027 from enacted-policy continuity. Same-era imports (states2023) and type-only imports are allowed.
 */

/**
 * US base policy for the 2027 preset: holds the latest enacted modern policy
 * (Jan 2023 Biden config). Tax optionIndexes unchanged from 2019 (TCJA rates).
 */

import type { CountryPolicyConfig } from "./basePolicies";
import { states2023 } from "./states2023";

export const COUNTRY_POLICY_CONFIGS_2027: Record<string, CountryPolicyConfig> = {
  // ═══════════════════════════════════════════════════════════════════════════
  //  UNITED STATES — Biden administration, January 2023 (118th Congress)
  // ═══════════════════════════════════════════════════════════════════════════
  us: {
    nationalStateId: "federal",
    defaults: {
      // ── Economy ────────────────────────────────────────────────────────────
      us_federal_income_tax_rate: { economic: 0, social: 0 }, // Jan 2023: TCJA rates still in effect
      us_federal_domestic_corporate_tax_rate: { economic: 0, social: 0 }, // Jan 2023: 21% TCJA corporate rate unchanged (IRA 15% alt-minimum enacted but primary rate 21%)
      us_federal_foreign_corporate_tax_rate: { economic: 0, social: 0 }, // Day-one parity with domestic; TCJA GILTI still in effect
      us_federal_payroll_tax_rate: { economic: 0, social: 0 }, // Jan 2023: standard 15.3% combined SS + Medicare unchanged
      us_federal_tariff_rate: { economic: 0, social: 0 }, // Game baseline: tariffs start at 0%; Biden largely kept Trump-era China tariffs but game baseline unchanged
      us_federal_sales_tax_rate: { economic: 0, social: 0 }, // Jan 2023: no federal sales tax (unchanged)
    },
    optionIndexes: {
      us_federal_income_tax_rate: 4, // 20% — TCJA effective rates unchanged in Jan 2023
      us_federal_domestic_corporate_tax_rate: 5, // 20% — TCJA 21% statutory rate still primary (IRA corporate AMT is supplemental)
      us_federal_foreign_corporate_tax_rate: 3, // 18% — GILTI/TCJA foreign treatment; closest option to domestic day-one parity
      us_federal_payroll_tax_rate: 5, // 15% — 15.3% combined SS + Medicare (unchanged from 2019)
      us_federal_tariff_rate: 0, // 0% — game baseline starts all tariffs at zero on reset
      us_federal_sales_tax_rate: 0, // 0% — no federal sales tax (unchanged)
    },
    regions: states2023,
  },
};
