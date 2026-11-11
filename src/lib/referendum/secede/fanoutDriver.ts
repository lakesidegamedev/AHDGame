/**
 * Applies one `FanoutScope` policy: redistributes a single-region aggregate's
 * documents across the seeded sub-regions when a registered region secedes.
 *
 * Tasks 4 implements the `_id`-keyed policies (cloneIdentical / scaleCounts /
 * copyDoc / scaleNumeric). Task 5 adds the bulk/composite/re-home policies.
 */
import { BSON, ObjectId } from "mongodb";
import { MONEY_MOVE_COLLECTION } from "@/lib/banking/moneyMove";
import { splitExtractionFields } from "./rules/extraction";
import { splitRegionalFinance } from "./rules/regionalFinance";
import { ENERGY_POSITION_BY_COUNTRY } from "@/lib/constants/cabinetEnergy";
import { INFRA_POSITION_BY_COUNTRY } from "@/lib/constants/cabinetInfra";
import type { Db } from "mongodb";
import type { State } from "@/lib/db/types";
import type { RegionCollectionName } from "../transfer/regionScopedCollections";
import type { FanoutScope } from "./fanoutPolicy";
import { CAPITAL_SUBREGION, secessionSource, type SecedingCountryId } from "./subRegions";
import { gdpWeights, partitionByGdp, populationWeights, splitCountVector } from "./apportion";
import { getPath, setPath, scaleDeep } from "./docScale";

export interface FanoutContext {
  /** The successor country every fanned-out document joins. */
  countryId: SecedingCountryId;
  /** The parent country the region leaves. */
  fromCountryId: string;
  /** The live aggregate region id the documents are read from. */
  regionId: string;
  seeds: State[];
  popWeights: Record<string, number>;
  gdpWeights: Record<string, number>;
  capital: string;
  /** Game's reset preset (GameState.preset) — selects the era demographic pattern. */
  preset?: string;
  sectorLocations?: Record<string, string>;
  resourceWeights?: Record<string, Record<string, number>>;
}

export function buildFanoutContext(
  countryId: SecedingCountryId,
  seeds: State[],
  preset?: string
): FanoutContext {
  return {
    countryId,
    ...secessionSource(countryId),
    seeds,
    popWeights: populationWeights(seeds),
    gdpWeights: gdpWeights(seeds),
    capital: CAPITAL_SUBREGION[countryId],
    preset,
  };
}

type AggDoc = Record<string, unknown>;

async function readAggregate(
  db: Db,
  collection: RegionCollectionName,
  regionId: string
): Promise<AggDoc | null> {
  return (await db
    .collection<AggDoc>(collection)
    .findOne({ _id: regionId } as AggDoc)) as AggDoc | null;
}

/** Clone the aggregate into one doc per sub-region, applying `mutate` to each. */
async function clonePerSubRegion(
  db: Db,
  scope: FanoutScope,
  ctx: FanoutContext,
  mutate: (clone: AggDoc, subId: string) => void
): Promise<number> {
  const agg = await readAggregate(db, scope.collection, ctx.regionId);
  if (!agg) return 0;
  const now = new Date();
  const docs = ctx.seeds.map((s) => {
    const clone = BSON.EJSON.parse(BSON.EJSON.stringify(agg)) as AggDoc;
    clone._id = s._id;
    clone.countryId = ctx.countryId;
    if (clone.stateId === ctx.regionId) clone.stateId = s._id;
    if (clone.regionId === ctx.regionId) clone.regionId = s._id;
    clone.updatedAt = now;
    mutate(clone, s._id);
    return clone;
  });
  await db.collection<AggDoc>(scope.collection).insertMany(docs);
  await db.collection<AggDoc>(scope.collection).deleteOne({ _id: ctx.regionId } as AggDoc);
  return docs.length;
}

export async function applyFanout(db: Db, scope: FanoutScope, ctx: FanoutContext): Promise<number> {
  switch (scope.policy) {
    case "cloneIdentical":
    case "copyDoc":
      // Identical copy per sub-region (snapshots / rate-profile docs).
      return clonePerSubRegion(db, scope, ctx, (clone) => {
        if (scope.collection === "politicalMetrics") delete clone.residuals;
      });

    case "scaleCounts": {
      const agg = await readAggregate(db, scope.collection, ctx.regionId);
      if (!agg) return 0;
      // Pre-split each count vector once (conserving per index).
      const splits: Record<string, Record<string, number[]>> = {};
      for (const field of scope.countVectorFields ?? []) {
        splits[field] = splitCountVector(getPath(agg, field) as number[], ctx.popWeights);
      }
      return clonePerSubRegion(db, scope, ctx, (clone, subId) => {
        for (const field of scope.countVectorFields ?? []) {
          setPath(clone, field, splits[field][subId]);
        }
      });
    }

    case "scaleNumeric":
      return clonePerSubRegion(db, scope, ctx, (clone, subId) => {
        const w =
          (scope.collection === "regionalBudgets" ? ctx.popWeights : ctx.gdpWeights)[subId] ?? 0;
        Object.assign(clone, splitRegionalFinance(clone, ctx, subId, w));
        for (const field of scope.scaleFields ?? []) {
          const v = getPath(clone, field);
          if (v !== undefined) setPath(clone, field, scaleDeep(v, w));
        }
      });

    case "partitionGdp": {
      // Distribute the many sector docs across sub-regions by GDP weight (revenue).
      const coll = db.collection<AggDoc>(scope.collection);
      const field = scope.key === "regionIdField" ? "regionId" : "stateId";
      const docs = (await coll
        .find(
          { [field]: ctx.regionId },
          { projection: { _id: 1, revenue: 1, capacityBase: 1, outputBase: 1 } }
        )
        .toArray()) as Array<{
        _id: unknown;
        revenue?: number;
        capacityBase?: number;
        outputBase?: number;
      }>;
      if (docs.length === 0) return 0;
      const buckets =
        ctx.sectorLocations && ["corporateSectors", "unownedSectors"].includes(scope.collection)
          ? Object.fromEntries(
              ctx.seeds.map((seed) => [
                seed._id,
                docs.filter(
                  (doc) =>
                    ctx.sectorLocations![`${scope.collection}:${String(doc._id)}`] === seed._id
                ),
              ])
            )
          : partitionByGdp(
              docs,
              (d) => d.revenue ?? d.capacityBase ?? d.outputBase ?? 1,
              ctx.seeds
            );
      const now = new Date();
      const ops = Object.entries(buckets).flatMap(([subId, items]) =>
        items.map((item) => ({
          updateOne: {
            filter: { _id: item._id as ObjectId },
            update: {
              $set: {
                [field]: subId,
                countryId: ctx.countryId,
                updatedAt: now,
                ...(scope.collection === "energyPlants"
                  ? { positionId: ENERGY_POSITION_BY_COUNTRY[ctx.countryId] }
                  : scope.collection === "infraProjects"
                    ? { positionId: INFRA_POSITION_BY_COUNTRY[ctx.countryId] }
                    : {}),
              },
            },
          },
        }))
      );
      if (ops.length) await coll.bulkWrite(ops);
      return docs.length;
    }

    case "splitCapacity":
    case "splitContracts": {
      const coll = db.collection<AggDoc>(scope.collection);
      const docs = await coll.find({ stateId: ctx.regionId }).toArray();
      if (!docs.length) return 0;
      if (scope.policy === "splitContracts") {
        const keys = docs.flatMap((doc) =>
          typeof doc.signingFeeAttemptKey === "string"
            ? [`extraction-signing-fee:${doc.signingFeeAttemptKey}`]
            : []
        );
        if (keys.length) {
          const receipts = await db
            .collection<{
              _id: string;
              status: string;
              projections?: Array<{ applied?: boolean }>;
            }>(MONEY_MOVE_COLLECTION)
            .find({ _id: { $in: keys } }, { projection: { status: 1, projections: 1 } })
            .toArray();
          if (
            keys.some(
              (key) =>
                !receipts.some(
                  (receipt) =>
                    receipt._id === key &&
                    receipt.status === "applied" &&
                    receipt.projections?.every((projection) => projection.applied)
                )
            )
          )
            throw new Error("An extraction signing-fee settlement must finish before independence");
        }
      }
      const rows = docs.flatMap((doc) =>
        ctx.seeds
          .filter(
            (seed) =>
              scope.policy === "splitCapacity" ||
              (ctx.resourceWeights?.[String(doc.resource)]?.[seed._id] ??
                ctx.gdpWeights[seed._id]) > 0
          )
          .map((seed) => ({
            ...doc,
            _id: new ObjectId(),
            stateId: seed._id,
            countryId: ctx.countryId,
            ...splitExtractionFields(
              doc,
              scope.policy === "splitContracts"
                ? (ctx.resourceWeights?.[String(doc.resource)]?.[seed._id] ??
                    ctx.gdpWeights[seed._id])
                : ctx.gdpWeights[seed._id],
              ctx.countryId,
              seed._id,
              scope.policy === "splitCapacity",
              Object.fromEntries(
                Object.entries(ctx.resourceWeights ?? {}).map(([resource, weights]) => [
                  resource,
                  weights[seed._id] ?? 0,
                ])
              )
            ),
            ...(scope.policy === "splitContracts" && doc.status === "active"
              ? { signingFeeAttemptKey: undefined }
              : {}),
          }))
      );
      await coll.insertMany(rows);
      await coll.deleteMany({ stateId: ctx.regionId });
      return rows.length;
    }

    case "rekeyCopyShares": {
      // Composite-keyed pool (`UK_SCO`): re-key per sub-region, copy the shares.
      const coll = db.collection<AggDoc>(scope.collection);
      const oldId = `${ctx.fromCountryId}_${ctx.regionId}`;
      const agg = (await coll.findOne({ _id: oldId } as AggDoc)) as AggDoc | null;
      if (!agg) return 0;
      const now = new Date();
      const docs = ctx.seeds.map((s) => ({
        ...structuredClone(agg),
        _id: `${ctx.countryId}_${s._id}`,
        countryId: ctx.countryId,
        stateId: s._id,
        updatedAt: now,
      })) as AggDoc[];
      await coll.insertMany(docs);
      await coll.deleteOne({ _id: oldId } as AggDoc);
      return docs.length;
    }

    case "rehomeCapital": {
      // Move the single-region docs onto the capital sub-region; residents (and
      // every re-homed doc) also adopt the new country.
      const field =
        scope.key === "homeStateField"
          ? "homeState"
          : scope.key === "stateField"
            ? "state"
            : "stateId";
      const res = await db
        .collection<AggDoc>(scope.collection)
        .updateMany(
          { [field]: ctx.regionId },
          { $set: { [field]: ctx.capital, countryId: ctx.countryId, updatedAt: new Date() } }
        );
      return res.modifiedCount ?? 0;
    }

    default:
      return 0;
  }
}
