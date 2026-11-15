import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import { COMMODITY_TYPES } from "@/lib/constants/commodities";
import { COUNTRY_REGIONS } from "@/lib/world/worldEntityManifest";
import { loadCountryTiers } from "@/lib/country/countryTier";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";
import type { CountryId } from "@/lib/constants/countries";
import { loadValuationFxRates } from "@/lib/currency/corporationCapital";
import type { Crisis, CrisisTemplate } from "@/lib/db/types/crisis";
import type { OrganizationMembership } from "@/lib/db/types/internationalOrganization";
import { getStatesCollection } from "@/lib/db/collections/states";
import { MACRO_COUNTRIES_COLLECTION } from "@/lib/db/collections/macroCountries";
import { decideOpenings, type DirectorActiveCrisis } from "@/lib/crises/v2/director";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { templateKeyFromDefinitionId } from "@/lib/crises/v2/legacyConvert";
import { spilloverShell } from "@/lib/crises/v2/spilloverShell";
import { ALL_CRISIS_TEMPLATES } from "@/lib/crises/templates";
import {
  allianceWeights,
  evaluateSpillover,
  regionWeights,
  gdpShareWeights,
  tradeWeights,
  type ChannelWeights,
  type SpilloverAction,
  type SpilloverCrisis,
  type SpilloverFeed,
  type SpilloverOpen,
  type SpilloverWorld,
  applyFeed,
} from "@/lib/crises/v2/spillover";
import type {
  CrisisDefinition,
  CrisisScope,
  SpilloverChannel,
  SpilloverRef,
} from "@/lib/crises/v2/types";
import { logWireEvent } from "@/lib/wireEvent";
import { logger } from "@/lib/observability/logger";
import { getCrisisDefinition } from "./registry";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { crisesCollection } from "@/lib/db/repositories/crises";
import { organizationMembershipsCollection } from "@/lib/db/repositories/organizationMemberships";
import { tradeFlowSnapshotsCollection } from "@/lib/db/repositories/tradeFlowSnapshots";

const COMPONENT = "crisisV2Spillover";

/** Same-region weights for channels with no bilateral ledger of their own. */
const CLIMATE_SAME_REGION = 1;
const MIGRATION_SAME_REGION = 0.6;
const MIGRATION_OTHER_REGION = 0.1;
/** Foreign sovereign debt worth this share of the holder's GDP counts as full weight. */
const FINANCE_FULL_GDP_SHARE = 0.05;
const BOND_UNIT_FACE = 1000;

export interface SpilloverCrisisDoc {
  _id: ObjectId;
  scope: Crisis["scope"];
  countryIds: string[];
  regionIds: string[];
  v2: NonNullable<Crisis["v2"]>;
}

async function loadTradeWeights(db: Db): Promise<ChannelWeights> {
  const projection: Record<string, 1> = { turn: 1 };
  for (const commodity of COMMODITY_TYPES) projection[`commodities.${commodity}.flow`] = 1;
  const snapshot = await tradeFlowSnapshotsCollection<{
    commodities?: Record<string, { flow?: Record<string, Record<string, number>> }>;
  }>(db).findOne({}, { sort: { turn: -1 }, projection });
  const flow = new Map<string, Map<string, number>>();
  for (const commodity of Object.values(snapshot?.commodities ?? {})) {
    for (const [exporter, byImporter] of Object.entries(commodity.flow ?? {})) {
      const row = flow.get(exporter) ?? new Map<string, number>();
      for (const [importer, value] of Object.entries(byImporter)) {
        row.set(importer, (row.get(importer) ?? 0) + value);
      }
      flow.set(exporter, row);
    }
  }
  return tradeWeights(flow);
}

async function loadAllianceWeights(db: Db): Promise<ChannelWeights> {
  const rows = await organizationMembershipsCollection(db)
    .find({}, { projection: { organizationId: 1, countryId: 1 } })
    .toArray();
  const memberships = new Map<string, Set<string>>();
  for (const row of rows) {
    const orgs = memberships.get(row.countryId) ?? new Set<string>();
    orgs.add(row.organizationId);
    memberships.set(row.countryId, orgs);
  }
  return allianceWeights(memberships);
}

/**
 * Finance: sovereign debt each holder country carries through its corporations,
 * valued at market in the issuer's currency, converted to the common unit and
 * sized against the holder's GDP.
 */
async function loadFinanceWeights(db: Db): Promise<ChannelWeights> {
  const bonds = await bondsCollection(db)
    .find(
      { issuerType: "sovereign", defaulted: false },
      {
        projection: {
          countryId: 1,
          marketPrice: 1,
          "holders.corporationId": 1,
          "holders.units": 1,
        },
      }
    )
    .toArray();
  const corporationIds = new Set<string>();
  for (const bond of bonds) {
    for (const holder of bond.holders ?? []) {
      if (holder.corporationId) corporationIds.add(holder.corporationId.toString());
    }
  }
  if (corporationIds.size === 0) return new Map();
  const [corporations, rates, budgets] = await Promise.all([
    getCorporationsCollection(db).then((collection) =>
      collection
        .find(
          { _id: { $in: [...corporationIds].map((id) => new ObjectId(id)) } },
          { projection: { countryId: 1 } }
        )
        .toArray()
    ),
    loadValuationFxRates(db),
    getFederalBudgetCollection(db).then((collection) =>
      collection.find({}, { projection: { countryId: 1, gdp: 1, gdpSmoothed: 1 } }).toArray()
    ),
  ]);
  const toCommon = (amount: number, countryId: string): number => {
    const code = COUNTRY_CURRENCY_MAP[countryId as CountryId];
    const rate = code ? rates.get(code) : undefined;
    return rate && rate > 0 ? amount / rate : amount;
  };
  const countryOfCorp = new Map(corporations.map((corp) => [corp._id.toString(), corp.countryId]));
  const exposure = new Map<string, Map<string, number>>();
  for (const bond of bonds) {
    if (!bond.countryId) continue;
    for (const holder of bond.holders ?? []) {
      const holderCountry = holder.corporationId
        ? countryOfCorp.get(holder.corporationId.toString())
        : undefined;
      if (!holderCountry) continue;
      const row = exposure.get(holderCountry) ?? new Map<string, number>();
      const value = holder.units * BOND_UNIT_FACE * (bond.marketPrice ?? 1);
      row.set(bond.countryId, (row.get(bond.countryId) ?? 0) + toCommon(value, bond.countryId));
      exposure.set(holderCountry, row);
    }
  }
  const gdp = new Map<string, number>();
  for (const budget of budgets) {
    const local = budget.gdpSmoothed && budget.gdpSmoothed > 0 ? budget.gdpSmoothed : budget.gdp;
    if (local > 0) gdp.set(budget.countryId, toCommon(local, budget.countryId));
  }
  return gdpShareWeights(exposure, gdp, FINANCE_FULL_GDP_SHARE);
}

function loadRegionChannel(
  countryIds: readonly string[],
  same: number,
  other: number
): ChannelWeights {
  const regionOf = new Map<string, string>();
  for (const countryId of countryIds) {
    const region = (COUNTRY_REGIONS as Record<string, string | undefined>)[countryId];
    if (region) regionOf.set(countryId, region);
  }
  return regionWeights(regionOf, same, other);
}

async function loadSizes(db: Db, backgroundIds: readonly string[]): Promise<Map<string, number>> {
  if (backgroundIds.length === 0) return new Map();
  const rows = await db
    .collection<{ entityId: string; population?: number }>(MACRO_COUNTRIES_COLLECTION)
    .find({ entityId: { $in: [...backgroundIds] } }, { projection: { entityId: 1, population: 1 } })
    .toArray();
  const largest = Math.max(1, ...rows.map((row) => row.population ?? 0));
  return new Map(rows.map((row) => [row.entityId, (row.population ?? 0) / largest]));
}

/**
 * Builds the world view for the channels the live links actually use. Each
 * channel is one or two bulk reads; a channel nobody links through is never read.
 */
export async function loadSpilloverWorld(
  db: Db,
  channels: ReadonlySet<SpilloverChannel>
): Promise<SpilloverWorld> {
  const tiers = await loadCountryTiers(db);
  const countryIds = tiers.registeredIds;
  const weights: SpilloverWorld["weights"] = {};
  const loaders: Record<SpilloverChannel, () => Promise<ChannelWeights>> = {
    trade: () => loadTradeWeights(db),
    finance: () => loadFinanceWeights(db),
    alliance: () => loadAllianceWeights(db),
    migration: async () =>
      loadRegionChannel(countryIds, MIGRATION_SAME_REGION, MIGRATION_OTHER_REGION),
    climate: async () => loadRegionChannel(countryIds, CLIMATE_SAME_REGION, 0),
  };
  await Promise.all(
    [...channels].map(async (channel) => {
      try {
        weights[channel] = await loaders[channel]();
      } catch (error) {
        logger.error(COMPONENT, "spillover channel failed; carries nothing this turn", error, {
          channel,
        });
      }
    })
  );
  const tierMap = new Map(countryIds.map((id) => [id, tiers.tierOf(id)]));
  return {
    weights,
    tiers: tierMap,
    sizeShare: await loadSizes(db, tiers.backgroundIds),
  };
}

export async function loadActiveCrisisDocs(db: Db): Promise<SpilloverCrisisDoc[]> {
  return (await crisesCollection(db)
    .find(
      { status: "active", "v2.definitionId": { $exists: true } },
      { projection: { scope: 1, countryIds: 1, regionIds: 1, v2: 1 } }
    )
    .toArray()) as unknown as SpilloverCrisisDoc[];
}

export async function resolveCrisisCountries(
  db: Db,
  docs: readonly SpilloverCrisisDoc[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const regionIds = new Set<string>();
  for (const doc of docs) {
    if (doc.countryIds.length === 0) for (const id of doc.regionIds) regionIds.add(id);
  }
  const countryByState = new Map<string, string>();
  if (regionIds.size > 0) {
    const states = await (
      await getStatesCollection(db)
    )
      .find({ _id: { $in: [...regionIds] } }, { projection: { countryId: 1 } })
      .toArray();
    for (const state of states) countryByState.set(state._id, state.countryId);
  }
  for (const doc of docs) {
    const countries =
      doc.countryIds.length > 0
        ? doc.countryIds
        : [...new Set(doc.regionIds.flatMap((id) => countryByState.get(id) ?? []))];
    result.set(doc._id.toString(), countries);
  }
  return result;
}

function toCrisisScope(scope: CrisisScope): Crisis["scope"] {
  if (scope === "global") return "global";
  if (scope === "national") return "country";
  return "region";
}

function ref(crisisId: ObjectId, definitionId: string, linkId: string): SpilloverRef {
  return { crisisId: crisisId.toString(), definitionId, linkId };
}

interface FeedPlan {
  action: SpilloverFeed;
  newSeverity: number;
}

function planFeeds(
  actions: readonly SpilloverAction[],
  byId: ReadonlyMap<string, SpilloverCrisisDoc>
): FeedPlan[] {
  const best = new Map<string, FeedPlan>();
  for (const action of actions) {
    if (action.kind !== "feed") continue;
    const target = byId.get(action.targetId);
    if (!target) continue;
    const current = best.get(action.targetId)?.newSeverity ?? target.v2.severity;
    const newSeverity = applyFeed(current, action.pressure);
    if (newSeverity > current) best.set(action.targetId, { action, newSeverity });
  }
  return [...best.values()];
}

async function writeFeeds(
  db: Db,
  feeds: readonly FeedPlan[],
  byId: ReadonlyMap<string, SpilloverCrisisDoc>
): Promise<number> {
  const writes: AnyBulkWriteOperation<Crisis>[] = [];
  for (const { action, newSeverity } of feeds) {
    const source = byId.get(action.sourceId);
    const target = byId.get(action.targetId);
    if (!source || !target) continue;
    const knownParent = target.v2.parents.some(
      (parent) => parent.crisisId === action.sourceId && parent.linkId === action.linkId
    );
    writes.push({
      updateOne: {
        filter: { _id: target._id, status: "active" },
        update: {
          $max: { "v2.severity": newSeverity, "v2.peakSeverity": newSeverity },
          ...(knownParent
            ? {}
            : { $push: { "v2.parents": ref(source._id, source.v2.definitionId, action.linkId) } }),
        },
      },
    });
    if (!knownParent) {
      writes.push({
        updateOne: {
          filter: { _id: source._id, status: "active" },
          update: {
            $push: { "v2.children": ref(target._id, target.v2.definitionId, action.linkId) },
          },
        },
      });
    }
  }
  if (writes.length === 0) return 0;
  await crisesCollection(db).bulkWrite(writes, { ordered: false });
  return feeds.length;
}

async function openSpilled(
  db: Db,
  turn: number,
  opens: readonly SpilloverOpen[],
  docs: readonly SpilloverCrisisDoc[],
  countries: ReadonlyMap<string, string[]>,
  byId: ReadonlyMap<string, SpilloverCrisisDoc>
): Promise<number> {
  if (opens.length === 0) return 0;
  const active: DirectorActiveCrisis[] = docs.map((doc) => ({
    definitionId: doc.v2.definitionId,
    scope: doc.v2.scope,
    stage: doc.v2.stage,
    countryIds: countries.get(doc._id.toString()) ?? [],
    startTurn: doc.v2.startTurn,
  }));
  const candidates = opens.map((open) => ({
    key: `spill:${open.linkId}:${open.sourceId}:${open.targetCountry}`,
    definitionId: open.targetDefinitionId,
    scope: "national" as const,
    countryIds: [open.targetCountry],
    priority: open.pressure,
  }));
  const decision = decideOpenings(candidates, active, turn);
  const openByKey = new Map(candidates.map((candidate, i) => [candidate.key, opens[i]]));

  const inserted: Crisis[] = [];
  const sourceChildren = new Map<string, SpilloverRef[]>();
  for (const approved of decision.approved) {
    const open = openByKey.get(approved.key);
    const def = open ? getCrisisDefinition(open.targetDefinitionId) : undefined;
    const source = open ? byId.get(open.sourceId) : undefined;
    if (!open || !def || !source) continue;
    const id = new ObjectId();
    const instance = createCrisisInstance(def as CrisisDefinition, turn);
    instance.parents = [ref(source._id, source.v2.definitionId, open.linkId)];
    const templateKey = templateKeyFromDefinitionId(def.id);
    const template = templateKey
      ? (ALL_CRISIS_TEMPLATES as Record<string, CrisisTemplate | undefined>)[templateKey]
      : undefined;
    const shell = spilloverShell(def, template?.effects);
    inserted.push({
      _id: id,
      name: def.label,
      description: def.label,
      scope: toCrisisScope(def.scope),
      countryIds: [open.targetCountry],
      regionIds: [],
      status: "active",
      startTurn: turn,
      endTurn: null,
      durationTurns: shell.durationTurns,
      effects: shell.effects,
      ...(templateKey ? { templateKey } : {}),
      wireMessageOnStart: `${def.label} is spreading.`,
      wireMessageOnEnd: `${def.label} has eased.`,
      createdBy: null,
      createdAt: new Date(),
      resolvedAt: null,
      autoGenerated: true,
      v2: instance,
    });
    const children = sourceChildren.get(open.sourceId) ?? [];
    children.push(ref(id, def.id, open.linkId));
    sourceChildren.set(open.sourceId, children);
  }
  if (inserted.length === 0) return 0;

  await crisesCollection(db).insertMany(inserted, { ordered: false });
  await crisesCollection(db).bulkWrite(
    [...sourceChildren].map(([sourceId, children]) => ({
      updateOne: {
        filter: { _id: new ObjectId(sourceId), status: "active" as const },
        update: { $push: { "v2.children": { $each: children } } },
      },
    })),
    { ordered: false }
  );
  for (const doc of inserted) {
    try {
      await logWireEvent("crisis_start", doc.wireMessageOnStart, {
        href: `/world/crises/${doc._id.toString()}`,
      });
    } catch (error) {
      logger.warn(COMPONENT, "spillover wire event failed", { error: String(error) });
    }
  }
  return inserted.length;
}

export interface SpilloverResult {
  fed: number;
  opened: number;
}

/**
 * Passes severity along the spillover links of every active v2 crisis: feeds an
 * existing crisis in the linked country or opens the target definition there
 * through the director. Reads only the channels live links use. A failure is
 * logged and the turn carries on.
 */
export async function runCrisisSpillover(db: Db, turn: number): Promise<SpilloverResult> {
  const result: SpilloverResult = { fed: 0, opened: 0 };
  try {
    const docs = await loadActiveCrisisDocs(db);
    if (docs.length === 0) return result;
    const definitions = new Map<string, CrisisDefinition>();
    const channels = new Set<SpilloverChannel>();
    for (const doc of docs) {
      const def = getCrisisDefinition(doc.v2.definitionId);
      if (!def || def.spillover.length === 0) continue;
      definitions.set(def.id, def);
      for (const link of def.spillover) {
        channels.add(link.channel);
        const target = getCrisisDefinition(link.targetDefinitionId);
        if (target) definitions.set(target.id, target);
      }
    }
    if (channels.size === 0) return result;

    const countries = await resolveCrisisCountries(db, docs);
    const crises: SpilloverCrisis[] = docs.map((doc) => ({
      id: doc._id.toString(),
      countryIds: countries.get(doc._id.toString()) ?? [],
      instance: doc.v2,
    }));
    const world = await loadSpilloverWorld(db, channels);
    const actions = evaluateSpillover({ turn, world, definitions, crises });
    if (actions.length === 0) return result;

    const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]));
    result.fed = await writeFeeds(db, planFeeds(actions, byId), byId);
    result.opened = await openSpilled(
      db,
      turn,
      actions.filter((action): action is SpilloverOpen => action.kind === "open"),
      docs,
      countries,
      byId
    );
  } catch (error) {
    logger.error(COMPONENT, "spillover failed; skipped this turn", error);
  }
  return result;
}
