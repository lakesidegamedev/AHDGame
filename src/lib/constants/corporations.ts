/**
 * What it costs to run a corporation and how to raise its profit margin. Founding
 * costs 1,000,000 (CORPORATION_FOUNDING_COST). New sectors start at a 35% margin
 * (DEFAULT_PROFIT_MARGIN); the home state adds +10, the home nation +5, a state's
 * primary or secondary specialization +10 or +5; margins above 80% are soft-capped
 * by softCapEffectiveMargin. CEO salary caps at 1.25x gross revenue, overhead at 1.5x.
 *
 * Tables live in corporationsTables, formulas in corporations/rules/corporationEconomy.
 * This module forwards both so existing imports keep working.
 */
export * from "./corporationsTables";
export {
  calcMarketingGrowth,
  softCapEffectiveMargin,
  calculateWorkers,
  dominanceDensityFactor,
  getDominanceGrowthCostMultiplier,
  getDominanceAttackEaseMultiplier,
  getDominanceMarginPenalty,
  getDominanceRegulatoryBurden,
  getNationalDominanceMarginPenalty,
  getNationalDominanceRegulatoryBurden,
  getNationalDominanceGrowthCostMultiplier,
  getUnderdogAttackAmplifier,
  getSustainedNegativeProductionPenalty,
  nextNegativeProductionCounter,
  acumenGrowthCostMultiplier,
  acumenRateSensitivity,
  calculateDailyGrowthCost,
  getSectorRiskPremium,
  getUnemploymentMarginModifier,
  getGridReliabilityMarginModifier,
  getCorruptionMarginModifier,
  getWorkforceSkillMarginModifier,
  getCrimeRateMarginModifier,
  getBroadbandMarginModifier,
  getRoadConditionMarginModifier,
  getCarbonEmissionsMarginModifier,
  getCostOfLivingMarginModifier,
  getExpropriationRiskMarginModifier,
  getHomeLocationMarginBonus,
  getStateSectorSpecializationMarginBonus,
  getInflationMarginModifier,
  getDebtToGdpMarginModifier,
  getDeficitToGdpMarginModifier,
  getLogisticsSupportedSectorCount,
  calcLogisticsGrowth,
  calcLogisticsStrengthAfterTurn,
  calcRdGrowth,
  calcRdScoreAfterTurn,
  rdMoraleFactor,
  managementOverheadPp,
  getSprawlModifier,
  getLogisticsShippingMultiplier,
  isSprawlExemptSectorType,
  computeAllMarginModifiers,
  sectorPolicyTargetMatches,
} from "@/lib/corporations/rules/corporationEconomy";
