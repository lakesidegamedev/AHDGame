/**
 * Era-Aware Legislation cost catalog (Spec B). Classifies every legislation type
 * by cost representation and resolves the era-native cost forms. Flag-on only:
 * the two forms are consulted by costs.ts only when the era year is non-null;
 * flag-off keeps the legacy COST_SCALE_ANCHORS path byte-identical.
 */
import { successorTaxInstrumentIds } from "@/lib/resetLegislation/successorTaxTypes";
import { MECHANICAL_TYPE_IDS } from "@/lib/mechanicalLaws/legislation";
import {
  MODERN_ERA_COST_CLASSES,
  MODERN_ERA_TYPE_IDS,
} from "@/lib/seeds/shared/modernEraLegislation";
import { getIncomeAnchor } from "./metricCatalog";
import { bankingSeparationLegislationTypes } from "@/lib/seeds/shared/bankingSeparationLegislation";
import { JP_ECONOMY } from "@/lib/countries/jp/economy";
import { US_ECONOMY } from "@/lib/countries/us/economy";
import { UK_ECONOMY } from "@/lib/countries/uk/economy";
import { DE_ECONOMY } from "@/lib/countries/de/economy";
import { CN_ECONOMY } from "@/lib/countries/cn/economy";
import { IE_ECONOMY } from "@/lib/countries/ie/economy";
import { NG_ECONOMY } from "@/lib/countries/ng/economy";
import { CA_ECONOMY } from "@/lib/countries/ca/economy";

export type CostClass = "gdpFraction" | "perCapita" | "none";

/**
 * Banking separation is regulatory with no budget cost; entries generated from
 * the seed list so a new legislature country can never drift out of coverage.
 */
const BANKING_SEPARATION_COST_CLASSES: Record<string, CostClass> = Object.fromEntries(
  bankingSeparationLegislationTypes.map((t) => [t._id, "none" as CostClass])
);

/** Per-type cost class. Populated in Task 3 (full coverage, validated). */
export const LEGISLATION_COST_CLASS: Record<string, CostClass> = {
  // Successor tax instruments collect revenue and have no spending-side cost.
  ...Object.fromEntries(successorTaxInstrumentIds.map((id) => [id, "none" as const])),
  ...BANKING_SEPARATION_COST_CLASSES,
  // Mechanical laws (competition, subsidiary limits, foreign investment) cost nothing.
  ...Object.fromEntries(MECHANICAL_TYPE_IDS.map((id) => [id, "none" as CostClass])),
  // 2027 to 2040 law types: hand-priced per option (see modernEraLegislation.ts).
  ...MODERN_ERA_COST_CLASSES,
  bal_economic_system: "none",
  bal_enterprise_levy: "none",
  bal_foreign_trade: "none",
  bal_income_tax: "none",
  bal_political_system: "none",
  bal_price_controls: "none",
  bal_product_tax: "none",
  bal_social_insurance: "none",
  br_corporate_tax: "none",
  br_customs_tariff: "none",
  br_defense_policy: "perCapita",
  br_education_funding: "perCapita",
  br_general_administration: "perCapita",
  br_iap_contribution: "none",
  br_income_tax_rate: "none",
  br_infrastructure_investment: "perCapita",
  br_ivc: "none",
  br_labor_law: "none",
  br_public_health: "perCapita",
  br_social_security_benefits: "perCapita",
  br_state_enterprises: "none",
  br_state_grants: "perCapita",
  bg_defense_appropriations: "gdpFraction",
  bg_economic_system: "none",
  bg_enterprise_levy: "none",
  bg_foreign_trade: "none",
  bg_income_tax: "none",
  bg_infrastructure_investment: "gdpFraction",
  bg_political_system: "none",
  bg_price_controls: "none",
  bg_product_tax: "none",
  bg_public_health_service: "gdpFraction",
  bg_regional_investment_grants: "gdpFraction",
  bg_social_insurance: "none",
  bg_social_security_fund: "gdpFraction",
  bg_state_administration: "gdpFraction",
  bg_universal_education: "gdpFraction",
  ukr_defense_appropriations: "gdpFraction",
  ukr_economic_system: "none",
  ukr_enterprise_levy: "none",
  ukr_foreign_trade: "none",
  ukr_income_tax: "none",
  ukr_infrastructure_investment: "gdpFraction",
  ukr_political_system: "none",
  ukr_price_controls: "none",
  ukr_product_tax: "none",
  ukr_public_health_service: "gdpFraction",
  ukr_regional_investment_grants: "gdpFraction",
  ukr_social_insurance: "none",
  ukr_social_security_fund: "gdpFraction",
  ukr_state_administration: "gdpFraction",
  ukr_universal_education: "gdpFraction",
  blr_defense_appropriations: "gdpFraction",
  blr_economic_system: "none",
  blr_enterprise_levy: "none",
  blr_foreign_trade: "none",
  blr_income_tax: "none",
  blr_infrastructure_investment: "gdpFraction",
  blr_political_system: "none",
  blr_price_controls: "none",
  blr_product_tax: "none",
  blr_public_health_service: "gdpFraction",
  blr_regional_investment_grants: "gdpFraction",
  blr_social_insurance: "none",
  blr_social_security_fund: "gdpFraction",
  blr_state_administration: "gdpFraction",
  blr_universal_education: "gdpFraction",
  bal_defense_appropriations: "gdpFraction",
  bal_infrastructure_investment: "gdpFraction",
  bal_public_health_service: "gdpFraction",
  bal_regional_investment_grants: "gdpFraction",
  bal_social_security_fund: "gdpFraction",
  bal_state_administration: "gdpFraction",
  bal_universal_education: "gdpFraction",
  cn_academic_pressure_reform: "none",
  cn_agricultural_subsidies: "gdpFraction",
  cn_ai_strategy: "gdpFraction",
  cn_anticorruption_campaign: "none",
  cn_belt_and_road: "gdpFraction",
  cn_climate_targets: "gdpFraction",
  cn_common_prosperity: "perCapita",
  cn_conscription: "gdpFraction",
  cn_criminal_justice: "gdpFraction",
  cn_customs_tariff: "none",
  cn_cybersecurity: "gdpFraction",
  cn_diaspora_engagement: "none",
  cn_digital_infrastructure: "gdpFraction",
  cn_education_funding: "perCapita",
  cn_elder_care: "perCapita",
  cn_emissions_trading_scheme: "gdpFraction",
  cn_enterprise_income_tax: "none",
  cn_family_policy: "perCapita",
  cn_fiscal_stimulus: "gdpFraction",
  cn_food_security: "gdpFraction",
  cn_gaokao_reform: "perCapita",
  cn_gender_equality: "perCapita",
  cn_hk_macao_affairs: "none",
  cn_housing: "gdpFraction",
  cn_hukou_reform: "none",
  cn_individual_income_tax: "none",
  cn_industrial_strategy: "gdpFraction",
  cn_internet_governance: "none",
  cn_land_value_added_tax: "none",
  cn_medical_insurance: "perCapita",
  cn_mental_health: "perCapita",
  cn_minimum_wage: "none",
  cn_npc_reform: "none",
  cn_nuclear_energy: "gdpFraction",
  cn_pension_system: "perCapita",
  cn_pla_modernization: "gdpFraction",
  cn_press_freedom: "none",
  cn_provincial_culture_propaganda: "gdpFraction",
  cn_provincial_economic_development: "gdpFraction",
  cn_provincial_education: "perCapita",
  cn_provincial_environmental_policy: "gdpFraction",
  cn_provincial_health_services: "perCapita",
  cn_provincial_infrastructure_investment: "gdpFraction",
  cn_provincial_public_security: "gdpFraction",
  cn_provincial_resource_tax: "none",
  cn_public_health: "perCapita",
  cn_public_security: "gdpFraction",
  cn_rail_transport: "gdpFraction",
  cn_renewable_energy_target: "gdpFraction",
  cn_research_science: "gdpFraction",
  cn_rural_revitalization: "gdpFraction",
  cn_semiconductor_strategy: "gdpFraction",
  cn_skilled_immigration: "none",
  cn_social_insurance_contribution: "none",
  cn_stamp_duty: "none",
  cn_state_enterprises: "gdpFraction",
  cn_state_media_funding: "gdpFraction",
  cn_taiwan_strait_doctrine: "gdpFraction",
  cn_un_security_council_posture: "none",
  cn_urban_maintenance_construction_tax: "none",
  cn_us_china_relations: "none",
  cn_value_added_tax: "none",
  cs_defense_appropriations: "gdpFraction",
  cs_economic_system: "none",
  cs_enterprise_levy: "none",
  cs_foreign_trade: "none",
  cs_income_tax: "none",
  cs_infrastructure_investment: "gdpFraction",
  cs_political_system: "none",
  cs_price_controls: "none",
  cs_product_tax: "none",
  cs_public_health_service: "gdpFraction",
  cs_regional_investment_grants: "gdpFraction",
  cs_social_insurance: "none",
  cs_social_security_fund: "gdpFraction",
  cs_state_administration: "gdpFraction",
  cs_universal_education: "gdpFraction",
  es_consumption_tax: "none",
  es_corporate_tax: "none",
  es_customs_tariff: "none",
  es_income_tax: "none",
  es_labor_law: "none",
  es_social_charges: "none",
  es_state_holdings: "none",
  es_welfare_state: "none",
  fr_corporate_tax: "none",
  fr_customs_tariff: "none",
  fr_defense_appropriations: "gdpFraction",
  fr_economic_subsidies: "gdpFraction",
  fr_education_funding: "gdpFraction",
  fr_health_insurance: "gdpFraction",
  fr_income_tax: "none",
  fr_infrastructure_investment: "gdpFraction",
  fr_labor_law: "none",
  fr_local_grants: "gdpFraction",
  fr_nationalization: "none",
  fr_social_charges: "none",
  fr_vat: "none",
  fr_welfare_state: "gdpFraction",
  hu_defense_appropriations: "gdpFraction",
  hu_economic_system: "none",
  hu_enterprise_levy: "none",
  hu_foreign_trade: "none",
  hu_income_tax: "none",
  hu_infrastructure_investment: "gdpFraction",
  hu_political_system: "none",
  hu_price_controls: "none",
  hu_product_tax: "none",
  hu_public_health_service: "gdpFraction",
  hu_regional_investment_grants: "gdpFraction",
  hu_social_insurance: "none",
  hu_social_security_fund: "gdpFraction",
  hu_state_administration: "gdpFraction",
  hu_universal_education: "gdpFraction",
  jp_fixed_asset_tax: "none",
  jp_resident_tax: "none",
  ie_agricultural_subsidies: "gdpFraction",
  ie_capital_gains_tax: "none",
  ie_childcare_policy: "perCapita",
  ie_climate_policy: "gdpFraction",
  ie_corporate_tax_rate: "none",
  ie_criminal_justice: "gdpFraction",
  ie_curriculum_reform: "perCapita",
  ie_customs_tariff_rate: "none",
  ie_cybersecurity: "gdpFraction",
  ie_defence_recruitment: "gdpFraction",
  ie_defence_spending: "gdpFraction",
  ie_digital_infrastructure: "gdpFraction",
  ie_drug_policy: "none",
  ie_education_funding: "perCapita",
  ie_elder_care: "perCapita",
  ie_electoral_reform: "none",
  ie_excise_duty: "none",
  ie_fiscal_stimulus: "gdpFraction",
  ie_food_security: "gdpFraction",
  ie_foreign_aid_diplomacy: "gdpFraction",
  ie_foreign_corporate_tax_rate: "none",
  ie_garda_policing: "gdpFraction",
  ie_gender_equality: "perCapita",
  ie_government_ethics: "none",
  ie_healthcare_policy: "perCapita",
  ie_higher_education: "perCapita",
  ie_housing_policy: "perCapita",
  ie_immigration_asylum: "none",
  ie_income_tax_rate: "none",
  ie_integration_programs: "perCapita",
  ie_local_property_tax: "none",
  ie_media_press: "gdpFraction",
  ie_mental_health: "perCapita",
  ie_minimum_wage: "none",
  ie_neutrality_posture: "none",
  ie_parental_leave: "perCapita",
  ie_peat_bog_policy: "gdpFraction",
  ie_prsi: "none",
  ie_public_health: "perCapita",
  ie_regional_economic_development: "gdpFraction",
  ie_regional_health: "perCapita",
  ie_regional_housing: "perCapita",
  ie_regional_skills: "perCapita",
  ie_regional_transport: "gdpFraction",
  ie_renewable_energy_target: "gdpFraction",
  ie_research_science: "gdpFraction",
  ie_rural_development: "gdpFraction",
  ie_sme_support: "gdpFraction",
  ie_stamp_duty: "none",
  ie_state_pensions: "perCapita",
  ie_transport_rail: "gdpFraction",
  ie_unemployment_benefits: "perCapita",
  ie_usc: "none",
  ie_vat_rate: "none",
  ie_work_visas: "none",
  ie_workers_rights: "none",
  ie_workforce_development: "perCapita",
  ie_working_family_payment: "perCapita",
  it_corporate_tax: "none",
  it_customs_tariff: "none",
  it_defense_appropriations: "gdpFraction",
  it_economic_subsidies: "gdpFraction",
  it_education_funding: "gdpFraction",
  it_health_insurance: "gdpFraction",
  it_income_tax: "none",
  it_infrastructure_investment: "gdpFraction",
  it_labor_law: "none",
  it_local_grants: "gdpFraction",
  it_social_charges: "none",
  it_state_holdings: "none",
  it_vat: "none",
  it_welfare_state: "gdpFraction",
  ng_agriculture_policy: "gdpFraction",
  ng_anti_corruption: "none",
  ng_basic_education: "perCapita",
  ng_capital_gains_tax: "none",
  ng_civil_service_reform: "gdpFraction",
  ng_companies_income_tax: "none",
  ng_counterinsurgency: "gdpFraction",
  ng_criminal_justice: "gdpFraction",
  ng_customs_tariff: "none",
  ng_defense_policy: "gdpFraction",
  ng_digital_economy: "gdpFraction",
  ng_disability_inclusion: "perCapita",
  ng_electoral_reform: "none",
  ng_environmental_protection: "gdpFraction",
  ng_excise_duty: "none",
  ng_federalism: "none",
  ng_fiscal_framework: "none",
  ng_foreign_policy: "none",
  ng_gender_equality: "perCapita",
  ng_health_insurance: "perCapita",
  ng_housing_policy: "perCapita",
  ng_immigration_policy: "none",
  ng_industrial_policy: "gdpFraction",
  ng_infrastructure_investment: "gdpFraction",
  ng_judiciary_reform: "none",
  ng_labor_rights: "none",
  ng_land_reform: "gdpFraction",
  ng_local_government: "none",
  ng_maternal_child_health: "perCapita",
  ng_mental_health: "perCapita",
  ng_minimum_wage: "none",
  ng_paye: "none",
  ng_pension_system: "perCapita",
  ng_personal_income_tax: "none",
  ng_petroleum_profit_tax: "none",
  ng_petroleum_sector_reform: "none",
  ng_policing_reform: "gdpFraction",
  ng_population_policy: "none",
  ng_power_sector_reform: "gdpFraction",
  ng_press_freedom: "none",
  ng_primary_healthcare: "perCapita",
  ng_public_health: "perCapita",
  ng_regional_integration: "none",
  ng_renewable_energy: "gdpFraction",
  ng_sme_support: "gdpFraction",
  ng_social_safety_net: "perCapita",
  ng_solid_minerals: "gdpFraction",
  ng_stamp_duty: "none",
  ng_technical_education: "perCapita",
  ng_telecommunications: "gdpFraction",
  ng_tertiary_education: "perCapita",
  ng_trade_promotion: "gdpFraction",
  ng_vat_rate: "none",
  ng_water_sanitation: "gdpFraction",
  ng_youth_employment: "gdpFraction",
  pl_defense_appropriations: "gdpFraction",
  pl_economic_system: "none",
  pl_enterprise_levy: "none",
  pl_foreign_trade: "none",
  pl_income_tax: "none",
  pl_infrastructure_investment: "gdpFraction",
  pl_political_system: "none",
  pl_price_controls: "none",
  pl_product_tax: "none",
  pl_public_health_service: "gdpFraction",
  pl_regional_investment_grants: "gdpFraction",
  pl_social_insurance: "none",
  pl_social_security_fund: "gdpFraction",
  pl_state_administration: "gdpFraction",
  pl_universal_education: "gdpFraction",
  ro_defense_appropriations: "gdpFraction",
  ro_economic_system: "none",
  ro_enterprise_levy: "none",
  ro_foreign_trade: "none",
  ro_income_tax: "none",
  ro_infrastructure_investment: "gdpFraction",
  ro_political_system: "none",
  ro_price_controls: "none",
  ro_product_tax: "none",
  ro_public_health_service: "gdpFraction",
  ro_regional_investment_grants: "gdpFraction",
  ro_social_insurance: "none",
  ro_social_security_fund: "gdpFraction",
  ro_state_administration: "gdpFraction",
  ro_universal_education: "gdpFraction",
  se_corporate_tax: "none",
  se_customs_tariff: "none",
  se_defense_appropriations: "gdpFraction",
  se_economic_subsidies: "gdpFraction",
  se_education_funding: "gdpFraction",
  se_health_insurance: "gdpFraction",
  se_income_tax: "none",
  se_infrastructure_investment: "gdpFraction",
  se_labor_law: "none",
  se_local_grants: "gdpFraction",
  se_social_charges: "none",
  se_vat: "none",
  se_wage_earner_funds: "none",
  se_welfare_state: "gdpFraction",
  at_corporate_tax: "none",
  at_customs_tariff: "none",
  at_defense_appropriations: "gdpFraction",
  at_economic_subsidies: "gdpFraction",
  at_education_funding: "gdpFraction",
  at_health_insurance: "gdpFraction",
  at_income_tax: "none",
  at_infrastructure_investment: "gdpFraction",
  at_labor_law: "none",
  at_local_grants: "gdpFraction",
  at_sales_tax: "none",
  at_social_charges: "none",
  at_state_enterprises: "none",
  at_welfare_state: "gdpFraction",
  fi_corporate_tax: "none",
  fi_customs_tariff: "none",
  fi_defense_appropriations: "gdpFraction",
  fi_economic_subsidies: "gdpFraction",
  fi_education_funding: "gdpFraction",
  fi_health_insurance: "gdpFraction",
  fi_income_tax: "none",
  fi_infrastructure_investment: "gdpFraction",
  fi_labor_law: "none",
  fi_local_grants: "gdpFraction",
  fi_sales_tax: "none",
  fi_social_charges: "none",
  fi_state_enterprises: "none",
  fi_welfare_state: "gdpFraction",
  gr_corporate_tax: "none",
  gr_customs_tariff: "none",
  gr_defense_appropriations: "gdpFraction",
  gr_economic_subsidies: "gdpFraction",
  gr_education_funding: "gdpFraction",
  gr_health_insurance: "gdpFraction",
  gr_income_tax: "none",
  gr_infrastructure_investment: "gdpFraction",
  gr_labor_law: "none",
  gr_local_grants: "gdpFraction",
  gr_sales_tax: "none",
  gr_social_charges: "none",
  gr_state_enterprises: "none",
  gr_welfare_state: "gdpFraction",
  tr_corporate_tax: "none",
  tr_customs_tariff: "none",
  tr_defense_appropriations: "gdpFraction",
  tr_economic_subsidies: "gdpFraction",
  tr_education_funding: "gdpFraction",
  tr_health_insurance: "gdpFraction",
  tr_income_tax: "none",
  tr_infrastructure_investment: "gdpFraction",
  tr_labor_law: "none",
  tr_local_grants: "gdpFraction",
  tr_sales_tax: "none",
  tr_social_charges: "none",
  tr_state_enterprises: "none",
  tr_welfare_state: "gdpFraction",
  us_state_compactness: "none",
  us_state_fairness: "none",
  us_state_redistricting_authority: "none",
  yu_defense_appropriations: "gdpFraction",
  yu_economic_system: "none",
  yu_enterprise_levy: "none",
  yu_foreign_trade: "none",
  yu_income_tax: "none",
  yu_infrastructure_investment: "gdpFraction",
  yu_political_system: "none",
  yu_price_controls: "none",
  yu_product_tax: "none",
  yu_public_health_service: "gdpFraction",
  yu_regional_investment_grants: "gdpFraction",
  yu_social_insurance: "none",
  yu_social_security_fund: "gdpFraction",
  yu_state_administration: "gdpFraction",
  yu_universal_education: "gdpFraction",
};

/** typeId → rationale for deviating from the domain default. */
export const COST_CLASS_OVERRIDES: Record<string, string> = {};

/** Unknown typeId ⇒ "none" (fail-safe: never invent a phantom cost line). */
export function getCostClass(typeId: string): CostClass {
  typeId = typeId.split(/__(?:income|capital)_/)[0];
  return LEGISLATION_COST_CLASS[typeId] ?? "none";
}

export interface EraCostContext {
  countryId: string;
  year: number;
  gdp: number;
  population: number;
  /**
   * The country's LIVE national median income (local currency — same
   * denomination as `gdp`). The perCapita charge base: costs must track the
   * game's own economic history, not the real-world era anchor (macro-v1
   * Phase 1).
   */
  nationalMedianIncome?: number;
}

export interface EraCostFields {
  gdpCostFraction?: number;
  incomeCostFraction?: number;
}

/**
 * Flag-on cost for a spending option/law. gdpFraction → fraction × GDP;
 * perCapita → fraction × GAME national median income × population (falls back
 * to the same share of GDP via the calibration-time income-to-GDP ratio when
 * the live income is unavailable — never the real-world era anchor, which
 * overweights costs wherever the game's history diverged from the real
 * world's); none/missing → 0.
 */
export function resolveEraSpendingCost(
  typeId: string,
  fields: EraCostFields,
  ctx: EraCostContext
): number | undefined {
  const cls = getCostClass(typeId);
  if (cls === "gdpFraction") {
    // A law/option classed here but never migrated onto the era catalog (no
    // `gdpCostFraction` on THIS document; it still carries a legacy
    // `gdpPerCapitaMultiplier`/`annualCostPerCapita`) must fall through to that
    // legacy field, not silently book $0. An explicit `0` (a genuinely
    // materialized zero-cost option) is still honoured; only an unmaterialized
    // (`undefined`/non-finite) field defers to legacy pricing.
    if (typeof fields.gdpCostFraction !== "number" || !Number.isFinite(fields.gdpCostFraction)) {
      return undefined;
    }
    return fields.gdpCostFraction * ctx.gdp;
  }
  if (cls === "perCapita") {
    if (
      typeof fields.incomeCostFraction !== "number" ||
      !Number.isFinite(fields.incomeCostFraction)
    ) {
      return undefined;
    }
    const frac = fields.incomeCostFraction;
    const i2g = incomeToGdp(ctx.countryId);
    // perCapita cost is pinned to the calibrated share of GDP:
    // `incomeCostFraction` is share / i2g, so `frac × i2g × gdp` === `share × gdp`.
    // The live national median income does not scale the charge; it is clamped
    // to the calibrated income-to-GDP ratio, which collapses to this expression.
    //
    // Upper clamp: a seed economy whose income metric never grew with GDP (CN
    // ¥67.6k vs ¥2.4k GDP/capita) would inflate spending to a phantom deficit.
    // Lower clamp: where the income metric sits below its calibration anchor
    // (JP 0.36x, NG 0.097x) every perCapita law was silently scaled down to a
    // fraction of its calibrated %GDP, suppressing all perCapita spending.
    //
    // Pinning restores the intended %GDP and matches how correctly calibrated
    // countries already resolved. It leaves i2g / frac untouched, so enacted-law
    // snapshots stay consistent and no reseed is needed. `nationalMedianIncome`
    // stays on the context for callers and telemetry but does not scale the charge.
    return frac * i2g * ctx.gdp;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calibration model (Spec B, per-option field materialization).
//
// The per-option cost fractions are MATERIALIZED onto each spending option at
// seed-build time by `withEraCosts`, from a real-world domain max-share × the
// option's generosity (its position on the type's own cost ladder). The fields
// live on the seed options (inspectable, and hand-overridable — the materializer
// never overwrites a value already set on an option).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Max-option spending share of GDP for a WHOLE domain (all its types at max
 * generosity, combined). This budget is SPLIT across the spending types in the
 * domain at materialize time (see {@link materializeEraCosts}) so a country with N
 * levers in a domain gets ~share/N per lever and the domain totals ~share when all
 * N are maxed — instead of each lever claiming the full share and the domain
 * stacking to N×share. (US healthcare has 7 types; pre-split that stacked to
 * ~0.31×GDP.) Summing every domain at max still lands above the ~45% revenue
 * ceiling (structurally unaffordable), per the dry-run.
 */
export const DOMAIN_MAX_SHARE: Record<string, number> = {
  healthcare: 0.03,
  welfare: 0.025,
  social: 0.02,
  education: 0.015,
  housing: 0.008,
  defense: 0.012,
  infrastructure: 0.01,
  environment: 0.005,
  agriculture: 0.004,
  publicSafety: 0.008,
  criminal_justice: 0.006,
  law_justice: 0.005,
  economic: 0.006,
  technology: 0.005,
  foreign_policy: 0.004,
  immigration: 0.004,
  labor: 0.004,
  labour: 0.004,
  mediaInformation: 0.002,
  governance: 0.002,
  government: 0.002,
  population: 0.004,
};

/** Per-type max-share overrides for big-ticket / outlier programs. */
export const COST_SHARE_OVERRIDES: Record<string, number> = {
  // Healthcare normalization: values are pre-CALIBRATION_SCALE (x1.5)
  // per-type max shares chosen so enacted generosity lands near the 2012
  // government-health-share-of-GDP anchor (US ~5.3%, UK ~7.5%, DE ~8.5%,
  // JP ~7.5%, CN ~1.7%, IE ~5.9%). Retune JP DOWN, never up, if dry-run
  // overshoots. After changing, reseed legislationTypes AND run
  // scripts/migrate-enacted-law-healthcare-fractions.ts: enacted laws
  // snapshot fractions and never re-read the catalog.
  cn_medical_insurance: 0.005,
  cn_elder_care: 0.002,
  cn_public_health: 0.002,
  cn_mental_health: 0.002,
  ie_healthcare_policy: 0.021,
};

/**
 * Global multiplier on every max-share, so "max everything" clears the
 * unaffordable-deficit floor across all countries (the country spread from type
 * counts / income ratios is absorbed here). Tuned via the dry-run.
 */
export const CALIBRATION_SCALE = 1.5;

// Representative modern (gdp, population) per playable country — from the 2019/2023
// budget seed configs. Used to precompute the income-to-GDP ratio so a perCapita
// share targets the same %GDP as a gdpFraction share.
/*
 * ⚠️ `Partial`, BECAUSE MOST COUNTRIES ARE NOT IN HERE. The map holds seven
 * keys; `incomeToGdp` has always read `const e = REP_ECON[country]` and returned
 * 0.8 when it came back undefined, so the guard was already written for an
 * absence the TYPE denied. Saying so lets a country folder omit `repEcon`
 * instead of inventing a representative economy for a country nobody measured.
 */
export const REP_ECON: Partial<Record<string, { gdp: number; population: number }>> = {
  US: US_ECONOMY.repEcon,
  UK: UK_ECONOMY.repEcon,
  DE: DE_ECONOMY.repEcon,
  JP: JP_ECONOMY.repEcon,
  IE: IE_ECONOMY.repEcon,
  CA: CA_ECONOMY.repEcon,
  CN: CN_ECONOMY.repEcon,
  NG: NG_ECONOMY.repEcon,
};

/** incomeAnchor(2019) × population / GDP — the household-income-to-GDP ratio. */
function incomeToGdp(country: string): number {
  const e = REP_ECON[country];
  const anchor = getIncomeAnchor(country, 2019);
  if (!e || anchor == null || e.gdp <= 0) return 0.8;
  return (anchor * e.population) / e.gdp;
}

interface MaterializeOption {
  effectDirection?: number;
  annualCostPerCapita?: number;
  gdpPerCapitaMultiplier?: number;
  gdpCostFraction?: number;
  incomeCostFraction?: number;
}
interface MaterializeType {
  _id: string;
  policyDomain: string;
  countryScope?: string;
  policyOptions?: MaterializeOption[];
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Types that carry their own per-option cost fractions and claim no domain share. */
const HAND_PRICED_TYPE_IDS: ReadonlySet<string> = new Set(MODERN_ERA_TYPE_IDS);

/** Group key for the per-domain type count: country scope + policy domain. */
function domainKey(type: MaterializeType): string {
  return `${(type.countryScope ?? "us").toUpperCase()}|${type.policyDomain}`;
}

/**
 * Count the non-`none` spending types per (countryScope, policyDomain) across a
 * type array. The count is the divisor that splits each domain's `DOMAIN_MAX_SHARE`
 * budget evenly across its levers, so `materializeEraCosts` needs the full set to
 * de-stack — call it via {@link withEraCosts}, not per-type in isolation.
 */
export function countDomainTypes(types: MaterializeType[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of types) {
    if (getCostClass(t._id) === "none") continue;
    // Hand-priced late-era laws must not split (and so reprice) the domain
    // share of the laws that were already calibrated against it.
    if (HAND_PRICED_TYPE_IDS.has(t._id)) continue;
    const k = domainKey(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/**
 * Stamp gdpCostFraction / incomeCostFraction onto every option of one spending
 * type (mutates + returns it). `none`-class types are left untouched. An option
 * that already carries a fraction (hand-authored override) is left as-is.
 *
 * `domainTypeCount` (from {@link countDomainTypes}) splits the domain's
 * `DOMAIN_MAX_SHARE` budget across the N spending types sharing that
 * (countryScope, policyDomain) so they don't each claim the full domain share and
 * stack. Omit it (or miss the key) ⇒ divisor 1 (single-type / legacy behavior).
 * A `COST_SHARE_OVERRIDES` value is an explicit PER-TYPE share and is never split.
 */
export function materializeEraCosts<T extends MaterializeType>(
  type: T,
  domainTypeCount?: Map<string, number>
): T {
  const cls = getCostClass(type._id);
  if (cls === "none") return type;
  const opts = type.policyOptions ?? [];
  if (opts.length === 0) return type;

  const override = COST_SHARE_OVERRIDES[type._id];
  const domainTotal = DOMAIN_MAX_SHARE[type.policyDomain] ?? 0.01;
  const divisor =
    override !== undefined ? 1 : Math.max(1, domainTypeCount?.get(domainKey(type)) ?? 1);
  const maxShare = ((override ?? domainTotal) / divisor) * CALIBRATION_SCALE;
  const country = (type.countryScope ?? "us").toUpperCase();
  const i2g = incomeToGdp(country);

  // Generosity: prefer the option's own legacy cost ladder; else effectDirection.
  const legacy = opts.map((o) => o.annualCostPerCapita ?? o.gdpPerCapitaMultiplier);
  const haveLegacy =
    legacy.every((c) => typeof c === "number") && Math.max(...(legacy as number[])) > 0;
  const maxLegacy = haveLegacy ? Math.max(...(legacy as number[])) : 0;

  for (let i = 0; i < opts.length; i++) {
    const o = opts[i];
    if (o.gdpCostFraction !== undefined || o.incomeCostFraction !== undefined) continue; // hand-set
    const g = haveLegacy
      ? (legacy[i] as number) / maxLegacy
      : o.effectDirection === 1
        ? 1
        : o.effectDirection === 0
          ? 0.4
          : 0.05;
    const share = maxShare * g;
    if (cls === "gdpFraction") o.gdpCostFraction = round5(share);
    else o.incomeCostFraction = round5(share / i2g);
  }
  return type;
}

/**
 * Apply {@link materializeEraCosts} across a legislation-type array (seed build),
 * splitting each domain's share across its types via {@link countDomainTypes}. Pass
 * the FULL type set so the per-domain counts are complete.
 */
export function withEraCosts<T extends MaterializeType>(types: T[]): T[] {
  const counts = countDomainTypes(types);
  return types.map((t) => materializeEraCosts(t, counts));
}
