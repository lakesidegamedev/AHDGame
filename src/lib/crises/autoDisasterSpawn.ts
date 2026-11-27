import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";
import { withSessionDb } from "@/lib/db/sessionDb";
import { settleTransition } from "@/lib/banking/settlementJournal";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import {
  COUNTRY_CURRENCY_MAP,
  ZOD_CURRENCY_ENUM,
  type CurrencyCode,
} from "@/lib/constants/currencies";
import { isLiveWorldSwitchOn } from "@/lib/gameConfig/liveWorldSwitches";
import { ObjectId, type Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { Crisis, CrisisEffect, CrisisTemplate } from "@/lib/db/types/crisis";
import type { FederalBudget } from "@/lib/db/types/budget";

import type { State } from "@/lib/db/types/state";
import {
  AUTO_DISASTER_CADENCE_TURNS,
  AUTO_DISASTER_DEFAULT_DURATION_TURNS,
  AUTO_DISASTER_MARGIN_PENALTY,
} from "./autoDisasterConstants";
import { DEFAULT_DISASTER_COOLDOWN_TURNS } from "./autoCrisisConstants";
import { disasterTemplatesForCountry } from "./selectDisasterTemplate";
import { getTemplateDuration } from "./templates";
import { getClimateExposureTags, regionMatchesTags } from "./regionHazards";
import { loadCooldownMap, isOnCooldown, stampCooldown } from "./autoCrisisCooldown";
import { floorCrisisDuration } from "./crisisDuration";
import { interpolateLocation } from "./crisisLocation";
import { isTemplateAllowedInYear } from "./crisisEraWindow";
import {
  climateLossMultiplier,
  climateProfileForStartingYear,
  weatherDisasterCadence,
  WEATHER_DISASTER_KEYS,
} from "./rules/climateFeedback";
import { climateExposureFromTags, uninsuredLossMultiplier } from "./rules/climateEffects";
import type { SpawnDirector } from "./spawnDirector";
import { legacyDefinitionId } from "./v2/legacyConvert";
import { createCrisisInstance } from "./v2/instance";
import { SPAWN_PRIORITY } from "./v2/spawnBudget";
import { legacyDefinitionFor } from "@/lib/turn/crisisV2/legacyContent";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { countryGameStatesCollection } from "@/lib/db/repositories/countryGameStates";
import { crisesCollection } from "@/lib/db/repositories/crises";
import { stateMetricsCollection } from "@/lib/db/repositories/stateMetrics";

interface ResilienceRow {
  _id: string;
  environment?: { climateResilience?: { value?: number } };
}

/** Accrue the whole loss once; only actually funded payments leave spendable cash. */
export async function chargeDisasterFiscalLoss(db: Db, crisis: Crisis): Promise<void> {
  const amount = crisis.autoDisasterFiscalCost;
  if (!amount || amount <= 0) return;
  if (!Number.isFinite(amount)) throw new Error("Invalid disaster fiscal loss");
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { treasuryCashLedgerEnabled: 1 } }
  );
  if (config?.treasuryCashLedgerEnabled !== true) {
    await federalBudgetCollection(db).updateOne(
      {
        countryId: crisis.countryIds[0] as FederalBudget["countryId"],
        disasterFiscalReceipts: { $ne: String(crisis._id) },
      },
      {
        $inc: { treasuryBalance: -amount },
        $addToSet: { disasterFiscalReceipts: String(crisis._id) },
      }
    );
    return;
  }
  await withSessionDb(db, async (tx) => {
    const fresh = await crisesCollection(tx).findOne({ _id: crisis._id });
    if (!fresh) return;
    const paid = fresh.autoDisasterFiscalPaidLocal ?? 0;
    const remaining = Math.max(0, amount - paid);
    if (!remaining) return;
    const budget = await federalBudgetCollection(tx).findOne({
      countryId: fresh.countryIds[0] as FederalBudget["countryId"],
    });
    if (!budget) {
      await crisesCollection(tx).updateOne(
        { _id: fresh._id },
        { $set: { autoDisasterFiscalUnfundedCost: remaining } }
      );
      return;
    }
    const rawCurrency =
      budget.currencyCode ?? COUNTRY_CURRENCY_MAP[fresh.countryIds[0] as CountryId];
    if (!ZOD_CURRENCY_ENUM.includes(rawCurrency as CurrencyCode))
      throw new Error("Disaster treasury currency is invalid");
    const currency = rawCurrency as CurrencyCode;
    if (!currency) throw new Error("Disaster treasury currency is unavailable");
    const accrualRecorded = budget.disasterFiscalReceipts?.includes(String(fresh._id)) === true;
    const available = Math.max(
      0,
      Number.isFinite(budget.treasuryCashLocal) ? (budget.treasuryCashLocal ?? 0) : 0
    );
    const sourceCurrency = fresh.autoDisasterFiscalCurrency ?? currency;
    let scale = 1;
    if (sourceCurrency !== currency) {
      const rates = await loadFxRatesByCurrency(tx),
        fromRate = rates.get(sourceCurrency),
        toRate = rates.get(currency);
      if (!(
        fromRate &&
        toRate &&
        Number.isFinite(fromRate) &&
        Number.isFinite(toRate) &&
        fromRate > 0 &&
        toRate > 0
      ))
        return;
      scale = toRate / fromRate;
    }
    const payment = Math.min(remaining * scale, available);
    const paidSource = payment / scale;
    if (payment > 0) {
      const state = await gameStateCollection(tx).findOne(
        { _id: "current" },
        { projection: { currentTurn: 1 } }
      );
      const settled = await settleTransition(tx, {
        key: `disaster-fiscal:${fresh._id}:${paid}:${payment}`,
        kind: "treasury_funded_expense",
        turn: state?.currentTurn ?? fresh.startTurn,
        currency,
        legs: [
          {
            kind: "debit",
            amount: payment,
            collection: "federalBudget",
            filter: { _id: budget._id, treasuryCashLocal: { $gte: payment } },
            path: "treasuryCashLocal",
            note: "Fund the accrued disaster expense from available Treasury cash",
          },
          {
            kind: "burn",
            amount: payment,
            note: "Settle the funded disaster loss outside government cash",
          },
        ],
        projections: [],
        event: {
          kind: "monetary.executed",
          command: "crisis.disasterFiscalLoss",
          subjectType: "government",
          subjectId: fresh.countryIds[0],
          amount: payment,
          meta: { flow: "crisis_response", crisisId: String(fresh._id) },
        },
      });
      if (settled.status !== "applied" && settled.status !== "replayed")
        throw new Error(settled.error ?? "Disaster fiscal payment is incomplete");
    }
    if (!accrualRecorded)
      await federalBudgetCollection(tx).updateOne(
        { _id: budget._id },
        {
          $inc: { treasuryBalance: -amount * scale },
          $addToSet: { disasterFiscalReceipts: String(fresh._id) },
        }
      );
    await crisesCollection(tx).updateOne(
      { _id: fresh._id },
      {
        $set: {
          autoDisasterFiscalCurrency: sourceCurrency,
          autoDisasterFiscalPaidLocal: paid + paidSource,
          autoDisasterFiscalUnfundedCost: Math.max(0, remaining - paidSource),
        },
      }
    );
  });
}

export async function settlePendingDisasterFiscalLosses(db: Db): Promise<void> {
  const pending = await crisesCollection(db)
    .find(
      { autoDisasterFiscalUnfundedCost: { $gt: 0 } },
      { projection: { countryIds: 1, autoDisasterFiscalCost: 1 } }
    )
    .limit(64)
    .toArray();
  for (const crisis of pending) await chargeDisasterFiscalLoss(db, crisis);
}

function chooseCandidate<T extends { key: string; region: State }>(
  candidates: readonly T[],
  seed: number,
  pressure: number,
  resilienceByRegion: ReadonlyMap<string, number>
): T {
  if (pressure <= 0) return candidates[Math.abs(seed) % candidates.length];
  const weights = candidates.map((candidate) =>
    WEATHER_DISASTER_KEYS.has(candidate.key)
      ? climateLossMultiplier(pressure, resilienceByRegion.get(candidate.region._id) ?? 50)
      : 1
  );
  if (weights.every((weight) => weight === weights[0]))
    return candidates[Math.abs(seed) % candidates.length];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = ((Math.abs(seed * 97) % 997) / 997) * total;
  for (let index = 0; index < candidates.length; index++) {
    target -= weights[index];
    if (target < 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
}

/** Stable hash of countryId → [0, cadence) offset so countries stagger. */
export function staggerHash(countryId: string): number {
  let h = 0;
  for (let i = 0; i < countryId.length; i++) {
    h = (h * 31 + countryId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % AUTO_DISASTER_CADENCE_TURNS;
}

/**
 * True when `countryId` is due for its next automatic disaster.
 *
 * For a country that has already had one, the anchor is `lastDisasterTurn` and
 * it fires every `AUTO_DISASTER_CADENCE_TURNS`. For a fresh country (undefined
 * `lastDisasterTurn`), the anchor is `staggerHash(countryId) - CADENCE`, so the
 * first disaster fires once `currentTurn >= staggerHash(countryId)` — i.e.
 * staggered within the first cadence window rather than all firing in lockstep.
 *
 * NB: this intentionally differs from the original implementation plan, whose
 * `anchor = currentTurn - staggerHash` formula would make a fresh country never
 * become due (diff would always be `staggerHash < CADENCE`). Do not "restore"
 * the plan's version.
 */
export function shouldSpawn(
  lastDisasterTurn: number | undefined,
  currentTurn: number,
  countryId: string,
  cadenceTurns = AUTO_DISASTER_CADENCE_TURNS
): boolean {
  const anchor = lastDisasterTurn ?? staggerHash(countryId) - cadenceTurns;
  return currentTurn - anchor >= cadenceTurns;
}

/**
 * Resolve the effects for a region-scoped disaster. Preserves a template's own
 * profit-margin effects (e.g. sector-targeted infrastructure disasters like a
 * bridge collapse) as decay effects so they feed the blended sector margin.
 * Templates without their own margin effects (most natural disasters) get the
 * generic onset margin shock.
 */
export function buildRegionalDisasterEffects(template: CrisisTemplate): CrisisEffect[] {
  const nonMarginEffects = template.effects.filter((e) => e.targetType !== "profitMargin");
  const templateMarginEffects = template.effects.filter((e) => e.targetType === "profitMargin");
  const marginEffects: CrisisEffect[] =
    templateMarginEffects.length > 0
      ? templateMarginEffects.map((e) => ({ ...e, effectType: "decay" as const }))
      : [
          {
            effectType: "decay" as const,
            targetType: "profitMargin" as const,
            metricCategory: null,
            metricField: null,
            sectorType: null,
            strategyId: null,
            value: AUTO_DISASTER_MARGIN_PENALTY,
            label: "Regional disaster margin shock",
          },
        ];
  return [...nonMarginEffects, ...marginEffects];
}

export async function processAutoDisasterSpawn(
  db: Db,
  countryId: CountryId,
  currentTurn: number,
  opts?: {
    enabled?: boolean;
    climatePressure?: number;
    /**
     * Budget for concurrent crises. When given, a disaster the budget refuses
     * stays due and lands on the first turn it fits.
     */
    director?: SpawnDirector;
  }
): Promise<void> {
  if (opts?.enabled !== true) return;

  const pressure = Math.max(0, Math.min(1, opts.climatePressure ?? 0));

  const cgs = await countryGameStatesCollection(db).findOne({ _id: countryId });

  const baselineDue = shouldSpawn(
    cgs?.lastDisasterTurn as number | undefined,
    currentTurn,
    countryId
  );
  const weatherDue = shouldSpawn(
    cgs?.lastDisasterTurn as number | undefined,
    currentTurn,
    countryId,
    weatherDisasterCadence(AUTO_DISASTER_CADENCE_TURNS, pressure)
  );
  if (!baselineDue && !weatherDue) {
    return;
  }

  const existing = await crisesCollection(db).findOne({
    autoSource: "disaster",
    countryIds: countryId,
    $or: [{ status: "active" }, { startTurn: currentTurn }],
  });
  if (existing) {
    await chargeDisasterFiscalLoss(db, existing);
    if (existing.templateKey) {
      const existingCooldowns = await loadCooldownMap(db);
      await stampCooldown(
        db,
        existingCooldowns,
        existing.templateKey,
        countryId,
        existing.startTurn
      );
    }
    // An interrupted first attempt may have inserted the crisis but failed
    // before stamping cadence. Reconcile both writes from the stored event.
    await countryGameStatesCollection(db).updateOne(
      { _id: countryId },
      { $max: { lastDisasterTurn: existing.startTurn } },
      { upsert: true }
    );
    return;
  }

  // Province/state/region-scale areas only. Constituencies are excluded: they
  // are sub-regional (e.g. single UK seats) and too small to host a
  // nation-scale natural disaster; "nation" is the country-level pseudo-region.
  const regions = await statesCollection(db)
    .find({ countryId, regionType: { $nin: [null, "nation", "constituency"] } } as never)
    .toArray();
  if (regions.length === 0) return;

  // Build the set of geographically-valid (region, template) pairs: the country
  // must be allowed by the template's gating, the region must carry the required
  // hazard tags (no hurricanes inland, no tsunamis off the coast), and the
  // template must be off its per-type cooldown for this country.
  const cooldowns = await loadCooldownMap(db);
  // Disaster templates go through the same era window as the economic/political
  // ones. They carry no window today, so this is a no-op for the current
  // catalogue — but it means a future era-bound disaster (an industrial or
  // nuclear one, say) cannot be added here and silently escape the gate.
  const gs = await gameStateCollection(db).findOne({ _id: "current" });
  const currentYear = gs?.currentYear;
  const eligibleTemplates = disasterTemplatesForCountry(countryId).filter(({ template }) =>
    isTemplateAllowedInYear(template, currentYear)
  );
  const candidates: Array<{ region: State; key: string; template: CrisisTemplate }> = [];
  for (const region of regions) {
    for (const { key, template } of eligibleTemplates) {
      if (!regionMatchesTags(countryId, region._id, template.geo?.requiresRegionTags)) continue;
      const cd = template.disasterCooldownTurns ?? DEFAULT_DISASTER_COOLDOWN_TURNS;
      if (isOnCooldown(cooldowns, key, countryId, currentTurn, cd)) continue;
      if (baselineDue || WEATHER_DISASTER_KEYS.has(key)) candidates.push({ region, key, template });
    }
  }
  if (candidates.length === 0) return;

  // Deterministic pick from the valid pairs so a re-run of the same turn is
  // idempotent (mirrors the staggerHash approach used for cadence).
  const seed = currentTurn + staggerHash(countryId);
  const resilienceByRegion = new Map<string, number>();
  if (pressure > 0) {
    const resilienceRows = await stateMetricsCollection<ResilienceRow>(db)
      .find(
        { _id: { $in: regions.map((region) => region._id) } },
        { projection: { _id: 1, "environment.climateResilience.value": 1 } }
      )
      .toArray();
    for (const row of resilienceRows) {
      const value = row.environment?.climateResilience?.value;
      if (typeof value === "number" && Number.isFinite(value))
        resilienceByRegion.set(row._id, value);
    }
  }
  const { region, key, template } = chooseCandidate(candidates, seed, pressure, resilienceByRegion);
  if (
    opts.director &&
    !opts.director.allow({
      key: `${key}:${region._id}`,
      definitionId: legacyDefinitionId(key),
      scope: "state",
      countryIds: [countryId],
      priority: SPAWN_PRIORITY.disaster,
    })
  ) {
    return;
  }

  const resolvedDuration = getTemplateDuration(template, "region");
  const durationTurns = floorCrisisDuration(
    resolvedDuration != null && resolvedDuration > 0
      ? resolvedDuration
      : template.durationTurns != null && template.durationTurns > 0
        ? template.durationTurns
        : AUTO_DISASTER_DEFAULT_DURATION_TURNS
  );

  // The affected region's real name (e.g. "California") substituted into the
  // template's `{location}` placeholder for flavor/wire text.
  const locationName = region.name ?? "the affected region";

  let fiscalCost = 0;
  if (WEATHER_DISASTER_KEYS.has(key)) {
    const budget = await federalBudgetCollection(db).findOne(
      { countryId },
      { projection: { gdp: 1, gdpSmoothed: 1 } }
    );
    const gdp = budget?.gdpSmoothed && budget.gdpSmoothed > 0 ? budget.gdpSmoothed : budget?.gdp;
    // Worlds with broader climate effects also shift uninsured loss onto the
    // budget as insurers retreat from exposed regions.
    const uninsured = climateProfileForStartingYear(gs?.startingYear).broaderEffects
      ? uninsuredLossMultiplier(
          pressure,
          climateExposureFromTags(getClimateExposureTags(countryId, region._id))
        )
      : 1;
    if (typeof gdp === "number" && Number.isFinite(gdp) && gdp > 0)
      fiscalCost = Math.max(
        0,
        Math.round(
          gdp *
            0.0002 *
            climateLossMultiplier(pressure, resilienceByRegion.get(region._id) ?? 50) *
            uninsured
        )
      );
  }
  const crisis: Crisis = {
    _id: new ObjectId(),
    name: template.name,
    description: interpolateLocation(template.description, locationName),
    heroImage: template.heroImage,
    scope: "region",
    countryIds: [countryId],
    regionIds: [region._id],
    status: "active",
    startTurn: currentTurn,
    endTurn: null,
    durationTurns,
    effects: buildRegionalDisasterEffects(template),
    wireMessageOnStart: interpolateLocation(template.wireMessageOnStart, locationName),
    wireMessageOnEnd: template.wireMessageOnEnd
      ? interpolateLocation(template.wireMessageOnEnd, locationName)
      : null,
    createdBy: null,
    createdAt: new Date(),
    resolvedAt: null,
    autoGenerated: true,
    autoSource: "disaster",
    templateKey: key,
    ...((await isLiveWorldSwitchOn(db, "crisisV2StagesEnabled"))
      ? {
          v2: createCrisisInstance(legacyDefinitionFor(key), currentTurn, {
            scope: "state",
            evaluateOnStart: true,
          }),
        }
      : {}),
    ...(fiscalCost > 0 ? { autoDisasterFiscalCost: fiscalCost } : {}),
  };

  await crisesCollection(db).insertOne(crisis);
  await chargeDisasterFiscalLoss(db, crisis);
  await stampCooldown(db, cooldowns, key, countryId, currentTurn);
  await countryGameStatesCollection(db).updateOne(
    { _id: countryId },
    { $set: { lastDisasterTurn: currentTurn } },
    { upsert: true }
  );
}
