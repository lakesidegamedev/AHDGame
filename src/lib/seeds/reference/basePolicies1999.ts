/**
 * SEED INDEPENDENCE — DO NOT DERIVE FROM ANOTHER ERA.
 * Each era seed is self-contained. This file MUST NOT import and transform
 * another era's COUNTRY_POLICY_CONFIGS. All values are authored for 1999
 * directly. Same-era imports (states1999) and type-only imports are allowed.
 */

/**
 * US base policy for the 1999 preset. Calibrated to 1999 real-world: balanced
 * budget surplus, post-PRWORA welfare restraint, NAFTA/WTO free trade,
 * Glass-Steagall repeal, assault weapons ban in force, Roe intact, DOMA/DADT,
 * post-Cold-War defense drawdown. Tax optionIndexes reflect post-1993-OBRA /
 * pre-Bush-cut rates.
 */

import type { CountryPolicyConfig } from "./basePolicies";
import { states1999 } from "./states1999";

export const COUNTRY_POLICY_CONFIGS_1999: Record<string, CountryPolicyConfig> = {
  // ═══════════════════════════════════════════════════════════════════════════
  //  UNITED STATES — Clinton administration, late 1999 (106th Congress)
  // ═══════════════════════════════════════════════════════════════════════════
  us: {
    nationalStateId: "federal",
    defaults: {
      // ── Economy ────────────────────────────────────────────────────────────
      us_federal_income_tax_rate: { economic: 0, social: 0 }, // 1999: OBRA-1993 rates in force (level in optionIndex)
      us_federal_domestic_corporate_tax_rate: { economic: 0, social: 0 }, // 1999: 35% statutory (level in optionIndex)
      us_federal_foreign_corporate_tax_rate: { economic: 0, social: 0 }, // Day-one parity below domestic; worldwide-with-deferral
      us_federal_payroll_tax_rate: { economic: 0, social: 0 }, // 1999: 15.3% combined SS + Medicare (unchanged)
      us_federal_tariff_rate: { economic: 0, social: 0 }, // Game baseline: tariffs start at 0% (and the NAFTA/WTO era is low-tariff)
      us_federal_sales_tax_rate: { economic: 0, social: 0 }, // 1999: no federal sales tax (unchanged)
    },
    optionIndexes: {
      us_federal_income_tax_rate: 5, // higher than the Bush-cut era: OBRA-1993 top rate 39.6%; individual income tax peaked ≈10% of GDP at the 2000 surplus
      us_federal_domestic_corporate_tax_rate: 8, // 35% statutory pre-TCJA
      us_federal_foreign_corporate_tax_rate: 6, // Day-one parity below domestic, proportional to the higher pre-TCJA domestic rate
      us_federal_payroll_tax_rate: 5, // 15% — SS + Medicare, identical across eras
      us_federal_tariff_rate: 0, // 0% game baseline
      us_federal_sales_tax_rate: 0, // 0% — no federal sales tax
    },
    regions: states1999,
  },
};
