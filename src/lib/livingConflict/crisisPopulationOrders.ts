/**
 * Population orders raised by Crisis v2 effects. They ride on the crisis
 * document and are consumed by the demographics phase through the same planners
 * as conflict outcomes, so deaths and arrivals keep their cohort accounting.
 */
import type { AnyBulkWriteOperation, Db, ObjectId } from "mongodb";
import { NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import { getStatesCollection } from "@/lib/db/collections/states";
import type { Crisis } from "@/lib/db/types/crisis";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import { getGameStateCollection } from "@/lib/db/collections/gameState";
import { ensureDemographicWorldEpoch } from "@/lib/demographics/worldEpoch";
import type { ConflictCivilianLossOrder } from "./rules/civilianLoss";
import { loadRefugeeAdmissionAuthorization } from "./refugeeReception";
import type { RefugeeReceptionOrder } from "./rules/refugeeReception";
import { crisesCollection } from "@/lib/db/repositories/crises";

/** Deaths from a single effect never exceed this share of a country's residents. */
export const MAX_LOSS_SHARE = 0.01;
/** Arrivals from a single effect never exceed this share of the host's residents. */
export const MAX_RECEPTION_SHARE = 0.02;
const RECEPTION_WINDOW_TURNS = 24;
const DEFAULT_SERVICE_GDP_SHARE = 0.2;
const DEFAULT_SERVICE_TURNS = 24;

export interface PopulationLossRequest {
  countryId: string;
  fraction: number;
}

export interface ReceptionRequest {
  originCountryId: string;
  destinationCountryId: string;
  fraction: number;
  serviceGdpShare?: number;
  serviceTurns?: number;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

async function orderClock(db: Db) {
  const collection = await getGameStateCollection(db);
  const world = await collection.findOne(
    { _id: "current" },
    {
      projection: {
        worldEpochId: 1,
        currentTurn: 1,
        isProcessing: 1,
        processingTargetTurn: 1,
      },
    }
  );
  if (!world || !Number.isSafeInteger(world.currentTurn) || world.currentTurn < 1) return null;
  const epochId = await ensureDemographicWorldEpoch(db, world);
  const effectiveTurn = Math.max(
    world.currentTurn + 1,
    world.isProcessing === true ? (world.processingTargetTurn ?? world.currentTurn) + 1 : 1
  );
  return { epochId, effectiveTurn };
}

async function populationByCountry(
  db: Db,
  countryIds: readonly string[]
): Promise<Map<string, { people: number; regionIds: string[] }>> {
  const states = await getStatesCollection(db);
  const rows = await states
    .find(
      { countryId: { $in: [...countryIds] as never[] } },
      { projection: { _id: 1, countryId: 1, population: 1 } }
    )
    .toArray();
  const byCountry = new Map<string, { people: number; regionIds: string[] }>();
  for (const row of rows) {
    if (NATIONAL_SCOPE_IDS.has(row._id)) continue;
    const entry = byCountry.get(row.countryId) ?? { people: 0, regionIds: [] };
    entry.people += Number.isFinite(row.population) ? Math.max(0, row.population) : 0;
    entry.regionIds.push(row._id);
    byCountry.set(row.countryId, entry);
  }
  return byCountry;
}

/**
 * Raises deterministic orders for this turn, so a replay finds them and adds
 * nothing. The orders take effect on the next demographics pass.
 */
export async function raiseCrisisPopulationOrders(
  db: Db,
  crisisId: ObjectId,
  turn: number,
  request: { losses: readonly PopulationLossRequest[]; receptions: readonly ReceptionRequest[] }
): Promise<number> {
  if (request.losses.length === 0 && request.receptions.length === 0) {
    return 0;
  }
  const clock = await orderClock(db);
  if (!clock) return 0;
  const { epochId, effectiveTurn } = clock;
  const crisisKey = crisisId.toHexString();

  const countryIds = new Set<string>();
  for (const loss of request.losses) countryIds.add(loss.countryId);
  for (const reception of request.receptions) countryIds.add(reception.destinationCountryId);
  const population = await populationByCountry(db, [...countryIds]);

  const lossShare = new Map<string, number>();
  for (const loss of request.losses) {
    lossShare.set(loss.countryId, (lossShare.get(loss.countryId) ?? 0) + loss.fraction);
  }
  const civilianLoss: ConflictCivilianLossOrder[] = [];
  for (const [countryId, share] of lossShare) {
    const pop = population.get(countryId);
    const fraction = clamp(share, MAX_LOSS_SHARE);
    if (!pop || pop.people <= 0 || fraction <= 0) continue;
    civilianLoss.push({
      _id: `${epochId}:${crisisKey}:${turn}:${countryId}:population-loss`,
      worldEpochId: epochId,
      origin: "crisis",
      interactionId: crisisKey,
      crisisId: crisisKey,
      outcomeId: "crisis-v2",
      countryId,
      regionIds: [...pop.regionIds].sort(),
      requestedPeople: pop.people * fraction,
      effectiveTurn,
      status: "pending",
    });
  }

  const reception: RefugeeReceptionOrder[] = [];
  const receptionRequests = request.receptions.filter(
    (entry) => entry.originCountryId !== entry.destinationCountryId
  );
  if (receptionRequests.length > 0) {
    const budgets = await (
      await getFederalBudgetCollection(db)
    )
      .find(
        {
          countryId: {
            $in: [...new Set(receptionRequests.map((r) => r.destinationCountryId))] as never[],
          },
        },
        { projection: { countryId: 1, gdp: 1, gdpSmoothed: 1 } }
      )
      .toArray();
    const gdpByCountry = new Map(
      budgets.map((b) => [
        b.countryId as string,
        b.gdpSmoothed && b.gdpSmoothed > 0 ? b.gdpSmoothed : b.gdp,
      ])
    );
    for (const entry of receptionRequests) {
      const pop = population.get(entry.destinationCountryId);
      const gdp = gdpByCountry.get(entry.destinationCountryId);
      const fraction = clamp(entry.fraction, MAX_RECEPTION_SHARE);
      if (!pop || pop.people <= 0 || fraction <= 0 || typeof gdp !== "number" || !(gdp > 0))
        continue;
      const authorization = await loadRefugeeAdmissionAuthorization(db, entry.destinationCountryId);
      authorization.displacementActive = true;
      reception.push({
        _id: `${epochId}:${crisisKey}:${turn}:${entry.destinationCountryId}:${entry.originCountryId}:refugees`,
        worldEpochId: epochId,
        origin: "crisis",
        interactionId: crisisKey,
        crisisId: crisisKey,
        nodeId: "crisis-v2",
        optionId: "crisis-v2",
        originCountryId: entry.originCountryId,
        destinationCountryId: entry.destinationCountryId,
        effectiveTurn,
        expiresTurn: effectiveTurn + RECEPTION_WINDOW_TURNS,
        requestedPeople: pop.people * fraction,
        annualServiceCostPerPerson:
          (gdp / pop.people) * clamp(entry.serviceGdpShare ?? DEFAULT_SERVICE_GDP_SHARE, 1),
        serviceDurationTurns: Math.max(
          1,
          Math.min(480, Math.round(entry.serviceTurns ?? DEFAULT_SERVICE_TURNS))
        ),
        authorization,
        status: "pending",
      });
    }
  }

  const ops: AnyBulkWriteOperation<Crisis>[] = [
    ...civilianLoss.map((order): AnyBulkWriteOperation<Crisis> => ({
      updateOne: {
        filter: { _id: crisisId, "populationOrders.civilianLoss._id": { $ne: order._id } },
        update: {
          $push: { "populationOrders.civilianLoss": order },
          $set: { "populationOrders.epochId": epochId, "populationOrders.pending": true },
        },
      },
    })),
    ...reception.map((order): AnyBulkWriteOperation<Crisis> => ({
      updateOne: {
        filter: { _id: crisisId, "populationOrders.reception._id": { $ne: order._id } },
        update: {
          $push: { "populationOrders.reception": order },
          $set: { "populationOrders.epochId": epochId, "populationOrders.pending": true },
        },
      },
    })),
  ];
  if (ops.length === 0) return 0;
  const written = await crisesCollection(db).bulkWrite(ops, { ordered: true });
  return written.modifiedCount;
}
