/**
 * Canada's 2027 political substrate: regions, default parties, voter groups,
 * regional metrics and baselines, provincial party organization and the
 * pending Commons formation. Canada seeds only once the 2027 roster includes
 * it, so this ships dark until the roster lists the country.
 */
import { ObjectId, type AnyBulkWriteOperation, type Db, type Document } from "mongodb";
import type { PoliticalParty, StateDemographics, StatePartyOrg } from "@/lib/db/types";
import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import { statesCollection } from "@/lib/db/repositories/states";
import { reserveSequentialIds } from "@/lib/db/sequentialId";
import { writeSplitMetricsBulk } from "@/lib/macroMetrics/split";
import { resolveSeedPartyTier } from "@/lib/seeds/defaultPartyTiers";
import {
  prunePresetMismatchedDefaultParties,
  selectPartyRosterForPreset,
} from "@/lib/seeds/ensureDefaultParties";
import { buildModelRegionDemographics } from "@/lib/seeds/international";
import {
  applyMetricPresetToBaseline,
  applyMetricPresetToMetrics,
  getRegionMetricPresets,
} from "@/lib/seeds/metricPresets";
import { tierFor } from "@/lib/world/eraRoster";
import { caRegions2027, CA_COMMONS_SEATS_PER_REGION } from "@/lib/countries/ca/data/caRegions2027";
import {
  caParties,
  CA_PARTY_SLUG_TO_NAME,
  CA_REGION_POLLING_2025,
} from "@/lib/countries/ca/data/caParties";
import { caStateMetrics } from "@/lib/countries/ca/data/caStateMetrics";
import { getCaModel } from "@/lib/countries/ca/layer1Model";
import {
  caPendingFormation,
  caSlugToPartyId,
  caStatePartyOrgRows,
} from "@/lib/countries/ca/rules/opening2027";
import { metricsToBaselines } from "./seedModernTransitionCountries";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";

const PRESET = "2027-default";
type Log = (message: string) => void;

/** True when this world's preset seeds Canada. */
export function seedsCanada(preset: string): boolean {
  return preset === PRESET && tierFor(PRESET, "CA") !== "absent";
}

export async function seedCA2027(db: Db, reset: boolean, log: Log, preset: string) {
  if (!seedsCanada(preset)) return;
  await writeCA2027(db, reset, log);
}

/** Writes the substrate unconditionally; callers gate on {@link seedsCanada}. */
export async function writeCA2027(db: Db, reset: boolean, log: Log): Promise<void> {
  if (reset) await clearCanada(db);
  await seedRegions(db);
  const parties = await seedParties(db);
  const groups = await seedVoterGroups(db);
  await seedMetricsAndBaselines(db);
  const orgs = await seedPartyOrganization(db, parties);
  const formation = caPendingFormation(CA_COMMONS_SEATS_PER_REGION);
  const now = new Date();
  await getGovernmentFormationsCollection(db).updateOne(
    { _id: formation._id },
    { $set: { ...formation, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  log(
    `Seeded CA 2027: ${caRegions2027.length} regions, ${parties.length} parties, ` +
      `${groups} voter-group regions, ${orgs} party organizations, ` +
      `${formation.totalSeats}-seat Commons pending (majority ${formation.majorityThreshold})`
  );
}

async function clearCanada(db: Db): Promise<void> {
  const regionIds = caRegions2027.map((region) => region._id);
  await Promise.all([
    statesCollection<Document>(db).deleteMany({ countryId: "CA" }),
    statePartyOrgCollection(db).deleteMany({ countryId: "CA" }),
    db.collection<StateDemographics>("stateDemographics").deleteMany({ countryId: "CA" }),
    db.collection<Document>("stateDemographicTurnout").deleteMany({ countryId: "CA" }),
    db.collection<Document>("macroMetrics").deleteMany({ countryId: "CA" }),
    db.collection<StateMetricBaseline>("stateBaselines").deleteMany({ _id: { $in: regionIds } }),
  ]);
}

async function seedRegions(db: Db): Promise<void> {
  await statesCollection(db).bulkWrite(
    caRegions2027.map(({ _id, ...data }) => ({
      updateOne: { filter: { _id }, update: { $set: data }, upsert: true },
    })),
    { ordered: false }
  );
}

async function seedParties(db: Db): Promise<PoliticalParty[]> {
  await prunePresetMismatchedDefaultParties(db, caParties, PRESET);
  const seeds = selectPartyRosterForPreset(caParties, PRESET);
  const parties = politicalPartiesCollection(db);
  const existing = await parties
    .find({ countryId: "CA", name: { $in: seeds.map((seed) => seed.name) } })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray();
  const existingByName = new Map(existing.map((party) => [party.name, party._id]));
  const fresh = seeds.filter((seed) => !existingByName.has(seed.name));
  const freshIds = await reserveSequentialIds(db, "party", fresh.length, "CA");
  const now = new Date();
  const ops: AnyBulkWriteOperation<PoliticalParty>[] = seeds.map((seed) => {
    const { seedOrder: _order, validForPresets: _presets, ...data } = seed;
    void _order;
    void _presets;
    const id = existingByName.get(seed.name);
    if (id) {
      return { updateOne: { filter: { _id: id }, update: { $set: { ...data, updatedAt: now } } } };
    }
    const document: PoliticalParty = {
      _id: new ObjectId(),
      sequentialId: freshIds[fresh.indexOf(seed)]!,
      ...data,
      tier: resolveSeedPartyTier(seed, PRESET),
      transactionApprovalMode: data.transactionApprovalMode ?? "double",
      createdAt: now,
      updatedAt: now,
    } as PoliticalParty;
    return { insertOne: { document } };
  });
  if (ops.length > 0) await parties.bulkWrite(ops, { ordered: true });
  return parties.find({ countryId: "CA", isDefault: true }).toArray();
}

async function seedVoterGroups(db: Db): Promise<number> {
  const model = getCaModel("2027");
  if (!model) return 0;
  const regions = buildModelRegionDemographics(model);
  await db.collection<StateDemographics>("stateDemographics").bulkWrite(
    regions.map(({ _id, groups: _groups, ...data }) => {
      void _groups;
      return { updateOne: { filter: { _id }, update: { $set: data }, upsert: true } };
    }),
    { ordered: false }
  );
  return regions.length;
}

async function seedMetricsAndBaselines(db: Db): Promise<void> {
  const metrics = caStateMetrics.map((metric) => {
    const overlay = getRegionMetricPresets("CA", String(metric._id), PRESET);
    return { ...(overlay ? applyMetricPresetToMetrics(metric, overlay) : metric), countryId: "CA" };
  });
  await writeSplitMetricsBulk(db, metrics);
  const baselines = metricsToBaselines(metrics).map((raw) => {
    const overlay = getRegionMetricPresets("CA", raw._id, PRESET);
    return overlay ? applyMetricPresetToBaseline(raw, overlay) : raw;
  });
  await db.collection<StateMetricBaseline>("stateBaselines").bulkWrite(
    baselines.map(({ _id, ...data }) => ({
      updateOne: { filter: { _id }, update: { $set: data }, upsert: true },
    })),
    { ordered: false }
  );
}

async function seedPartyOrganization(db: Db, parties: PoliticalParty[]): Promise<number> {
  const rows = caStatePartyOrgRows(
    CA_REGION_POLLING_2025,
    caSlugToPartyId(CA_PARTY_SLUG_TO_NAME, parties)
  );
  if (rows.length === 0) return 0;
  const now = new Date();
  await statePartyOrgCollection(db).bulkWrite(
    rows.map(({ _id, ...data }) => ({
      updateOne: {
        filter: { _id },
        update: { $set: { ...data, updatedAt: now }, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  return rows.length;
}
