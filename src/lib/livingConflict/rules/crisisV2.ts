/**
 * Living-conflict campaigns expressed as Crisis v2 definitions, and the
 * campaign rules (civilian loss, capacity destruction, refugee reception,
 * trade sanctions) as effect modules.
 *
 * Plain data in, plain data out. A module reads the authored rule spec from its
 * params and emits the intents the rule stands for when the crisis enters the
 * stage the spec names; who answered, which orders exist and replay fences stay
 * with the global-response resolver that owns the conflict's ledger.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import type { EffectIntent, EffectModule } from "@/lib/crises/v2/effectModule";
import { stanceLeversFor } from "@/lib/crises/v2/stanceLevers";
import type {
  CrisisDefinition,
  EffectModuleRef,
  SpilloverLink,
  CrisisScope,
} from "@/lib/crises/v2/types";
import type { CapacityDestructionSpec } from "@/lib/db/types/conflictCapacity";
import type { GlobalResponseOutcome } from "@/lib/db/types/crisis";
import type { LivingConflictDef } from "../types";
import { validateCapacityDestructionSpec } from "./capacityDestruction";
import { requestedConflictCivilianLoss, type ConflictCivilianLossSpec } from "./civilianLoss";
import type { RefugeeReceptionSpec } from "./refugeeReception";

export const CAMPAIGN_DEFINITION_PREFIX = "lc.";

export const CIVILIAN_LOSS_MODULE_ID = "lc.civilianLoss";
export const CAPACITY_DESTRUCTION_MODULE_ID = "lc.capacityDestruction";
export const REFUGEE_RECEPTION_MODULE_ID = "lc.refugeeReception";
export const SANCTIONS_MODULE_ID = "lc.sanctions";

export function campaignDefinitionId(defKey: string): string {
  return `${CAMPAIGN_DEFINITION_PREFIX}${defKey}`;
}

/** Input key carrying a campaign's 0..100 intensity. */
export function campaignIntensityInput(defKey: string): string {
  return `lc.intensity.${defKey}`;
}

/** Stage whose entry applies the campaign's one-off rule effects. */
const RULE_STAGE = "peak";

const SCOPE_BY_TYPE: Record<LivingConflictDef["type"], CrisisScope> = {
  proxy_war: "global",
  geopolitical: "global",
  pandemic: "global",
  disaster: "national",
};

type Params = Record<string, number | string | boolean>;

function enteredStage(
  ctx: { stage: string; turn: number; instance: { stageStartTurn: number } },
  params: Params
): boolean {
  return ctx.stage === (params.onStage ?? RULE_STAGE) && ctx.instance.stageStartTurn === ctx.turn;
}

export const civilianLossModule: EffectModule = {
  id: CIVILIAN_LOSS_MODULE_ID,
  evaluate(ctx, params) {
    if (!enteredStage(ctx, params)) return [];
    const spec: ConflictCivilianLossSpec = {
      countryId: String(params.countryId),
      residentPopulationShare: Number(params.share),
    };
    // one resident of the stock sizes the share, and validates the spec
    const fraction = requestedConflictCivilianLoss(spec, 1);
    return [{ kind: "populationLoss", fraction, countryId: spec.countryId }];
  },
};

export function encodeCapacityRegions(spec: CapacityDestructionSpec): string {
  return spec.regions.map((r) => `${r.regionId}:${r.capitalShare}`).join("|");
}

function decodeCapacitySpec(params: Params): CapacityDestructionSpec {
  return {
    regions: String(params.regions)
      .split("|")
      .map((entry) => {
        const [regionId, share] = entry.split(":");
        return { regionId, capitalShare: Number(share) };
      }),
    maxOutstandingShare: Number(params.maxOutstandingShare),
    repairTurns: Number(params.repairTurns),
    repairCostMultiplier: Number(params.repairCostMultiplier),
  };
}

export const capacityDestructionModule: EffectModule = {
  id: CAPACITY_DESTRUCTION_MODULE_ID,
  evaluate(ctx, params) {
    if (!enteredStage(ctx, params)) return [];
    const spec = decodeCapacitySpec(params);
    validateCapacityDestructionSpec(spec);
    return spec.regions.map((region): EffectIntent => ({
      kind: "capitalStock",
      fraction: region.capitalShare,
      regionId: region.regionId,
    }));
  },
};

export const refugeeReceptionModule: EffectModule = {
  id: REFUGEE_RECEPTION_MODULE_ID,
  evaluate(ctx, params) {
    if (!enteredStage(ctx, params)) return [];
    const share = Number(params.hostPopulationShare);
    if (!Number.isFinite(share) || share <= 0) throw new Error("Invalid reception share");
    return [{ kind: "migration", fraction: share, fromCountryId: String(params.originCountryId) }];
  },
};

export const sanctionsModule: EffectModule = {
  id: SANCTIONS_MODULE_ID,
  evaluate(ctx, params) {
    if (!enteredStage(ctx, params)) return [];
    const durationTurns = Number(params.durationTurns);
    if (!Number.isInteger(durationTurns) || durationTurns <= 0) {
      throw new Error("A crisis sanction requires a positive duration.");
    }
    return [
      {
        kind: "tradeRestriction",
        commodity: String(params.commodity) as CommodityType,
        targetRole: String(params.targetRole),
        durationTurns,
      },
    ];
  },
};

export const CAMPAIGN_EFFECT_MODULES: readonly EffectModule[] = [
  civilianLossModule,
  capacityDestructionModule,
  refugeeReceptionModule,
  sanctionsModule,
];

/** Rule specs a definition authors on its response outcomes and decision options. */
export function campaignRuleRefs(def: LivingConflictDef): EffectModuleRef[] {
  const refs = new Map<string, EffectModuleRef>();
  const add = (ref: EffectModuleRef) =>
    refs.set(`${ref.moduleId}|${JSON.stringify(ref.params)}`, ref);
  const outcomeRules = (outcome: GlobalResponseOutcome) => {
    if (outcome.civilianLoss) {
      add({
        moduleId: CIVILIAN_LOSS_MODULE_ID,
        params: {
          countryId: outcome.civilianLoss.countryId,
          share: outcome.civilianLoss.residentPopulationShare,
          onStage: RULE_STAGE,
        },
      });
    }
    if (outcome.capacityDestruction) {
      const spec = outcome.capacityDestruction;
      add({
        moduleId: CAPACITY_DESTRUCTION_MODULE_ID,
        params: {
          regions: encodeCapacityRegions(spec),
          maxOutstandingShare: spec.maxOutstandingShare,
          repairTurns: spec.repairTurns,
          repairCostMultiplier: spec.repairCostMultiplier,
          onStage: RULE_STAGE,
        },
      });
    }
    if (outcome.tradeSanction) {
      const sanction = outcome.tradeSanction;
      add({
        moduleId: SANCTIONS_MODULE_ID,
        params: {
          participationAxis: sanction.participationAxis,
          targetRole: sanction.targetRole,
          commodity: sanction.commodity,
          durationTurns: sanction.durationTurns,
          onStage: RULE_STAGE,
        },
      });
    }
  };
  const receptionRule = (spec: RefugeeReceptionSpec) =>
    add({
      moduleId: REFUGEE_RECEPTION_MODULE_ID,
      params: {
        originCountryId: spec.originCountryId,
        conflictKey: spec.conflictKey,
        hostPopulationShare: spec.hostPopulationShare,
        annualServiceGdpPerCapitaShare: spec.annualServiceGdpPerCapitaShare,
        serviceDurationTurns: spec.serviceDurationTurns,
        onStage: RULE_STAGE,
      },
    });
  for (const phase of def.phases) {
    for (const event of phase.events) {
      for (const outcome of event.response?.outcomes ?? []) outcomeRules(outcome);
      for (const node of Object.values(event.response?.decisionTrees ?? {})) {
        for (const option of node?.options ?? []) {
          if (option.refugeeReception) receptionRule(option.refugeeReception);
        }
      }
    }
    for (const node of Object.values(phase.decisionTrees)) {
      for (const option of node?.options ?? []) {
        if (option.refugeeReception) receptionRule(option.refugeeReception);
      }
    }
  }
  return [...refs.values()];
}

/**
 * How each campaign leaks into the wider world. Targets are definitions that
 * exist for every campaign; the channel names the economy or population link
 * that carries the shock.
 */
export const CAMPAIGN_SPILLOVER: Readonly<Record<string, readonly SpilloverLink[]>> = {
  russia_ukraine_security: [
    link("energy", "energy_crisis", "trade", 45, 0.5),
    link("refugees", "refugee_crisis", "migration", 55, 0.4),
  ],
  yugoslav_dissolution: [link("refugees", "refugee_crisis", "migration", 40, 0.4)],
  arab_uprisings: [
    link("refugees", "refugee_crisis", "migration", 45, 0.4),
    link("energy", "energy_crisis", "trade", 55, 0.3),
  ],
  pandemic: [
    link("supply", "supply_chain_disruption", "trade", 40, 0.5),
    link("downturn", "recession", "finance", 55, 0.4),
  ],
  global_financial_crisis: [
    link("contagion", "debt_default_contagion", "finance", 45, 0.5),
    link("downturn", "recession", "finance", 40, 0.6),
  ],
  pacific_strait_crisis: [link("supply", "supply_chain_disruption", "trade", 40, 0.6)],
  infrastructure_cyberattack: [link("grid", "power_grid_failure", "trade", 45, 0.4)],
  ai_labour_shock: [link("downturn", "recession", "finance", 55, 0.3)],
  oil_disruption: [link("energy", "energy_crisis", "trade", 35, 0.7)],
  nuclear_incident: [link("fallout", "nuclear_accident", "alliance", 60, 0.3)],
  transnational_terrorism: [link("security", "mass_protests", "alliance", 55, 0.2)],
  vietnam: [link("antiwar", "antiwar_protest", "alliance", 40, 0.4)],
  berlin: [link("trade", "trade_war", "trade", 50, 0.3)],
  congo: [link("refugees", "refugee_crisis", "migration", 50, 0.3)],
  suez_aftermath: [link("energy", "energy_crisis", "trade", 45, 0.4)],
  northern_ireland: [],
  second_pandemic: [
    link("freight", "autonomous_logistics_stall", "trade", 45, 0.4),
    link("pensions", "longevity_pension_strain", "finance", 55, 0.3),
  ],
  sovereign_debt_wave: [
    link("lenders", "tech_lender_run", "finance", 45, 0.4),
    link("housing", "housing_rate_reset_crash", "finance", 50, 0.4),
    link("pensions", "pension_funding_cliff", "finance", 55, 0.3),
  ],
  grid_cascade: [link("grid", "grid_emergency", "trade", 40, 0.6)],
  critical_minerals_squeeze: [
    link("chips", "chip_fab_fire", "trade", 45, 0.4),
    link("freight", "autonomous_logistics_stall", "trade", 55, 0.3),
  ],
  climate_migration_surge: [
    link("insurance", "climate_insurance_retreat", "climate", 50, 0.3),
    link("water", "municipal_water_rationing", "migration", 55, 0.3),
  ],
  arctic_opening: [link("shipping", "autonomous_logistics_stall", "trade", 55, 0.3)],
  antimicrobial_resistance: [
    link("food", "engineered_crop_blight", "trade", 55, 0.3),
    link("pensions", "longevity_pension_strain", "finance", 60, 0.3),
  ],
  orbital_debris: [link("satellites", "orbital_debris_outage", "trade", 40, 0.7)],
  fusion_breakthrough: [link("displacement", "automation_layoff_wave", "finance", 60, 0.15)],
  election_integrity_crisis: [
    link("media", "synthetic_media_market_panic", "alliance", 50, 0.4),
    link("models", "ai_model_failure_scandal", "alliance", 60, 0.2),
  ],
};

function link(
  id: string,
  templateKey: string,
  channel: SpilloverLink["channel"],
  minSeverity: number,
  transmission: number
): SpilloverLink {
  return {
    id,
    channel,
    targetDefinitionId: `legacy:${templateKey}`,
    minSeverity,
    minStage: "onset",
    transmission,
    delayTurns: 2,
  };
}

/**
 * A campaign as a tracked v2 definition: its intensity is the severity, its
 * stages follow from thresholds, and its authored rules ride along as modules.
 */
export function convertLivingConflictDef(def: LivingConflictDef): CrisisDefinition {
  const stageRule = { minTurns: 1, maxTurns: null };
  return {
    id: campaignDefinitionId(def.key),
    source: "scripted",
    scope: SCOPE_BY_TYPE[def.type],
    label: def.name,
    stages: { signal: stageRule, onset: stageRule, peak: stageRule, aftermath: stageRule },
    thresholds: { onset: 25, peak: 50, easing: 35, resolve: 10 },
    maxRelapses: 3,
    severity: {
      initial: 20,
      drivers: [],
      mitigationCap: 30,
      actingThreshold: 1,
      inaction: { graceTurns: 100_000, perTurn: 0, growthPerTurn: 0, maxPerTurn: 0 },
    },
    levers: stanceLeversFor(def.key),
    // Outcome rules fire for the outcome a response selected, which only the
    // response resolver knows. Listing them here would apply every outcome's
    // rules when the mirror reaches its peak.
    effectModules: [],
    spillover: CAMPAIGN_SPILLOVER[def.key] ?? [],
    scarRules: [],
    forcedEvents: [],
    pacing: { kind: "tracked", input: campaignIntensityInput(def.key) },
  };
}
