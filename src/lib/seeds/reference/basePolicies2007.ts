/**
 * SEED INDEPENDENCE — DO NOT DERIVE FROM ANOTHER ERA.
 * Each era seed is self-contained. This file MUST NOT import and transform
 * another era's seed data (e.g. the 2019/2023 COUNTRY_POLICY_CONFIGS). All
 * values are authored for 2007 directly. Same-era imports (states2007) and
 * type-only imports are allowed.
 */

/**
 * US national + regional base policy positions for the 2007-default preset
 * (mid-2007, 110th Congress, Bush administration, divided government).
 *
 * Key 2007 anchors vs 2019/2023: Iraq surge-era defense outlays; pre-TCJA 35%
 * corporate rate; Medicare Part D non-interference clause (no drug negotiation);
 * pre-ACA healthcare; fossil/nuclear-favoring energy posture; first federal
 * minimum-wage rise since 1997 but still low; Roe intact; permissive guns.
 *
 * Tax `optionIndexes` reflect the pre-TCJA rate regime.
 */

import type { CountryPolicyConfig } from "./basePolicies";
import { states2007 } from "./states2007";

export const COUNTRY_POLICY_CONFIGS_2007: Record<string, CountryPolicyConfig> = {
  // ═══════════════════════════════════════════════════════════════════════════
  //  UNITED STATES — G.W. Bush administration, mid-2007 (110th Congress)
  // ═══════════════════════════════════════════════════════════════════════════
  us: {
    nationalStateId: "federal",
    defaults: {
      // ── Economy ────────────────────────────────────────────────────────────
      us_federal_income_tax_rate: { economic: 0, social: 0 }, // 2007: Bush tax cuts in force (level in optionIndex)
      us_federal_domestic_corporate_tax_rate: { economic: 0, social: 0 }, // 2007: 35% statutory (level in optionIndex)
      us_federal_foreign_corporate_tax_rate: { economic: 0, social: 0 }, // Day-one parity below domestic; pre-GILTI worldwide-with-deferral
      us_federal_payroll_tax_rate: { economic: 0, social: 0 }, // 2007: 15.3% combined SS + Medicare (unchanged across eras)
      us_federal_tariff_rate: { economic: 0, social: 0 }, // Game baseline: tariffs start at 0%
      us_federal_sales_tax_rate: { economic: 0, social: 0 }, // 2007: no federal sales tax (unchanged)
    },
    optionIndexes: {
      us_federal_income_tax_rate: 4, // ~20% effective revenue knob (individual income tax ≈ 7.9% of GDP in 2007); matches the cross-era calibration
      us_federal_domestic_corporate_tax_rate: 8, // 35% statutory pre-TCJA (same regime as the 1991 seed's 34%)
      us_federal_foreign_corporate_tax_rate: 6, // Day-one parity below domestic, proportional to the higher pre-TCJA domestic rate
      us_federal_payroll_tax_rate: 5, // 15% — SS + Medicare, identical across eras
      us_federal_tariff_rate: 0, // 0% game baseline (all tariffs start at zero on reset)
      us_federal_sales_tax_rate: 0, // 0% — no federal sales tax
    },
    regions: states2007,
  },
};
