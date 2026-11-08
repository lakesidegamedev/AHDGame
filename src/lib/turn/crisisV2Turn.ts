import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import { getStatesCollection } from "@/lib/db/collections/states";
import { logger } from "@/lib/observability/logger";
import { logWireEvent } from "@/lib/wireEvent";
import type { Crisis, CrisisLeverUse, CrisisV2Output } from "@/lib/db/types/crisis";
import {
  recordInaction,
  recordLeverUses,
  type OfficeHolders,
} from "@/lib/crises/v2/accountability";
import {
  decideOpenings,
  type DirectorActiveCrisis,
  type DirectorCandidate,
} from "@/lib/crises/v2/director";
import { evaluateEffectModules } from "@/lib/crises/v2/effectModule";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { applySeverityStep, computeSeverityStep } from "@/lib/crises/v2/severity";
import { applyTransition, nextStage } from "@/lib/crises/v2/stageMachine";
import type {
  CrisisDefinition,
  CrisisInstance,
  CrisisRole,
  CrisisScope,
  LeverUse,
} from "@/lib/crises/v2/types";
import { processCrisisEmergencyBills } from "@/lib/crises/levers/emergencyBill";
import {
  filterExposedHolders,
  type CrisisReach,
  type HolderFootprint,
} from "@/lib/crises/v2/exposure";
import { EMERGENCY_APPROVAL_DRIFT, stepForcedEvents } from "@/lib/crises/v2/forcedEvents";
import { layScars, scarHorizon, scarTargets } from "@/lib/crises/v2/scars";
import type { EffectIntent } from "@/lib/crises/v2/effectModule";
import { ensureBuiltinCrisisV2Content } from "./crisisV2/builtins";
import { settleCrisisConsequences } from "./crisisV2/consequences";
import { runForcedEvents } from "./crisisV2/forcedEventsShell";
import { ensureBuiltinCrisisHolderProviders } from "./crisisV2/holderProviders";
import { processCrisisScars } from "./crisisV2/scarsShell";
import { routeEffectIntents } from "./crisisV2/intents";
import {
  getCrisisDefinition,
  getCrisisEffectRegistry,
  getCrisisInputProvider,
  listCrisisHolderProviders,
  listCrisisOpenCandidateProviders,
  type CrisisOpenCandidate,
} from "./crisisV2/registry";

const COMPONENT = "crisisV2Turn";

export interface CrisisV2TurnResult {
  processed: number;
  failed: number;
  resolved: number;
  opened: number;
}

type LiveCrisis = Pick<
  Crisis,
  "_id" | "name" | "scope" | "countryIds" | "regionIds" | "wireMessageOnEnd" | "startTurn"
> & { v2: CrisisInstance };

interface World {
  allStateIds: string[];
  stateIdsByCountry: Map<string, string[]>;
  countryByState: Map<string, string>;
}

const EMPTY_RESULT: CrisisV2TurnResult = { processed: 0, failed: 0, resolved: 0, opened: 0 };

const LIVE_PROJECTION = {
  name: 1,
  scope: 1,
  countryIds: 1,
  regionIds: 1,
  wireMessageOnEnd: 1,
  startTurn: 1,
  v2: 1,
} as const;

async function loadWorld(db: Db): Promise<World> {
  const statesCollection = await getStatesCollection(db);
  const states = await statesCollection
    .find({}, { projection: { _id: 1, countryId: 1 } })
    .toArray();
  const stateIdsByCountry = new Map<string, string[]>();
  const countryByState = new Map<string, string>();
  for (const state of states) {
    const ids = stateIdsByCountry.get(state.countryId) ?? [];
    ids.push(state._id);
    stateIdsByCountry.set(state.countryId, ids);
    countryByState.set(state._id, state.countryId);
  }
  return { allStateIds: states.map((s) => s._id), stateIdsByCountry, countryByState };
}

function crisisCountryIds(crisis: LiveCrisis, world: World): string[] {
  if (crisis.scope === "global") return [...world.stateIdsByCountry.keys()];
  if (crisis.countryIds.length > 0) return crisis.countryIds;
  const derived = new Set<string>();
  for (const stateId of crisis.regionIds) {
    const countryId = world.countryByState.get(stateId);
    if (countryId) derived.add(countryId);
  }
  return [...derived];
}

function crisisStateIds(crisis: LiveCrisis, world: World): string[] {
  if (crisis.scope === "global") return world.allStateIds;
  if (crisis.scope === "country") {
    return crisis.countryIds.flatMap((id) => world.stateIdsByCountry.get(id) ?? []);
  }
  return crisis.regionIds;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

async function loadInputs(
  db: Db,
  turn: number,
  defs: ReadonlyMap<string, CrisisDefinition>,
  countryIds: ReadonlySet<string>,
  world: World
): Promise<Map<string, Map<string, number>>> {
  const wanted = new Set<string>();
  for (const def of defs.values()) {
    for (const driver of def.severity.drivers) wanted.add(driver.input);
  }
  const loaded = new Map<string, Map<string, number>>();
  // One context for every provider, so inputs that share a read load it once.
  const inputContext = { db, turn, countryIds, stateIdsByCountry: world.stateIdsByCountry };
  await Promise.all(
    [...wanted].map(async (input) => {
      const provider = getCrisisInputProvider(input);
      if (!provider) return;
      try {
        loaded.set(input, await provider.load(inputContext));
      } catch (error) {
        logger.error(COMPONENT, "input provider failed; reading as 0", error, { input });
      }
    })
  );
  return loaded;
}

function mergeHolders(
  perCountry: Map<string, OfficeHolders>[],
  countryIds: string[]
): OfficeHolders {
  const merged: Partial<Record<CrisisRole, Set<string>>> = {};
  for (const byCountry of perCountry) {
    for (const countryId of countryIds) {
      for (const [role, ids] of Object.entries(byCountry.get(countryId) ?? {})) {
        const set = (merged[role as CrisisRole] ??= new Set());
        for (const id of ids ?? []) set.add(id);
      }
    }
  }
  const result: OfficeHolders = {};
  for (const [role, set] of Object.entries(merged)) result[role as CrisisRole] = [...set];
  return result;
}

async function loadHolders(
  db: Db,
  turn: number,
  countryIds: ReadonlySet<string>
): Promise<Map<string, OfficeHolders>[]> {
  const loaded: Map<string, OfficeHolders>[] = [];
  for (const provider of listCrisisHolderProviders()) {
    try {
      loaded.push(await provider.load({ db, turn, countryIds }));
    } catch (error) {
      logger.error(COMPONENT, "holder provider failed; no inaction rows from it", error, {
        provider: provider.id,
      });
    }
  }
  return loaded;
}

/**
 * Claims a crisis's step for this turn before any effect is routed, so a retry
 * after a failed state write cannot apply the same effects twice. Losing the
 * claim means another run already stepped it.
 */
async function claimTurn(db: Db, crisisId: ObjectId, turn: number): Promise<boolean> {
  const claimed = await db.collection<Crisis>("crises").updateOne(
    {
      _id: crisisId,
      status: "active",
      $or: [
        { "v2.lastEvaluatedTurn": { $exists: false } },
        { "v2.lastEvaluatedTurn": { $lt: turn } },
      ],
    },
    { $set: { "v2.lastEvaluatedTurn": turn } }
  );
  return claimed.matchedCount > 0;
}

function toCrisisScope(scope: CrisisScope): Crisis["scope"] {
  if (scope === "global") return "global";
  if (scope === "national") return "country";
  return "region";
}

async function openApproved(
  db: Db,
  turn: number,
  approved: readonly CrisisOpenCandidate[]
): Promise<number> {
  const docs: Crisis[] = [];
  for (const candidate of approved) {
    const def = getCrisisDefinition(candidate.definitionId);
    if (!def) continue;
    docs.push({
      _id: new ObjectId(),
      name: def.label,
      description: def.label,
      scope: toCrisisScope(candidate.scope),
      countryIds: [...candidate.countryIds],
      regionIds: [...candidate.regionIds],
      status: "active",
      startTurn: turn,
      endTurn: null,
      durationTurns: null,
      effects: [],
      wireMessageOnStart: `${def.label} is developing.`,
      wireMessageOnEnd: `${def.label} has eased.`,
      createdBy: null,
      createdAt: new Date(),
      resolvedAt: null,
      autoGenerated: true,
      v2: createCrisisInstance(def, turn),
    });
  }
  if (docs.length === 0) return 0;
  await db.collection<Crisis>("crises").insertMany(docs, { ordered: false });
  for (const doc of docs) {
    try {
      await logWireEvent("crisis_start", doc.wireMessageOnStart, {
        href: `/world/crises/${doc._id.toString()}`,
      });
    } catch (error) {
      logger.warn(COMPONENT, "opening wire event failed", { error: String(error) });
    }
  }
  return docs.length;
}

async function openNewCrises(
  db: Db,
  turn: number,
  stillActive: readonly DirectorActiveCrisis[]
): Promise<number> {
  const providers = listCrisisOpenCandidateProviders();
  if (providers.length === 0) return 0;
  const candidates: CrisisOpenCandidate[] = [];
  for (const provider of providers) {
    try {
      candidates.push(...(await provider.load({ db, turn })));
    } catch (error) {
      logger.error(COMPONENT, "open-candidate provider failed", error, { provider: provider.id });
    }
  }
  const known = candidates.filter((candidate) => getCrisisDefinition(candidate.definitionId));
  if (known.length === 0) return 0;
  const decision = decideOpenings(known as DirectorCandidate[], stillActive, turn);
  const byKey = new Map(known.map((candidate) => [candidate.key, candidate]));
  const approved = decision.approved.flatMap((candidate) => byKey.get(candidate.key) ?? []);
  try {
    return await openApproved(db, turn, approved);
  } catch (error) {
    logger.error(COMPONENT, "opening approved crises failed", error);
    return 0;
  }
}

async function loadFootprints(
  db: Db,
  turn: number,
  perCountry: Map<string, OfficeHolders>[]
): Promise<Map<string, HolderFootprint>> {
  const ids = new Set<string>();
  for (const byCountry of perCountry) {
    for (const holders of byCountry.values()) {
      for (const role of ["stateGovernor", "corpCeo"] as const) {
        for (const id of holders[role] ?? []) ids.add(id);
      }
    }
  }
  const footprints = new Map<string, HolderFootprint>();
  if (ids.size === 0) return footprints;
  for (const provider of listCrisisHolderProviders()) {
    if (!provider.loadFootprints) continue;
    try {
      const loaded = await provider.loadFootprints({ db, turn, holderIds: [...ids] });
      for (const [id, footprint] of loaded) footprints.set(id, footprint);
    } catch (error) {
      logger.error(COMPONENT, "footprint provider failed; local roles go unblamed", error, {
        provider: provider.id,
      });
    }
  }
  return footprints;
}

/**
 * Runs every active Crisis v2 instance one turn: fills driver inputs from the
 * sim, applies the lever uses recorded for it, steps severity and stage, routes
 * effect intents to the owning systems and writes the instance back in one bulk
 * write. A crisis that throws is skipped and the rest still run.
 *
 * While no crisis carries a `v2` instance and emergent detection is off, this costs
 * one indexed read, one config read and one projected read of the states.
 */
export async function processCrisisV2Turn(db: Db, turn: number): Promise<CrisisV2TurnResult> {
  ensureBuiltinCrisisV2Content();
  const loadLive = async () =>
    (await db
      .collection<Crisis>("crises")
      .find(
        { status: "active", "v2.definitionId": { $exists: true } },
        { projection: LIVE_PROJECTION }
      )
      .toArray()) as unknown as LiveCrisis[];
  let crises = await loadLive();
  if (crises.length > 0) {
    // outcomes land on the instance before it is read for stepping
    const bills = await processCrisisEmergencyBills(db, turn);
    if (bills.failed > 0) crises = await loadLive();
  }

  if (crises.length === 0 && listCrisisOpenCandidateProviders().length === 0) return EMPTY_RESULT;

  ensureBuiltinCrisisHolderProviders();
  const world: World =
    crises.length > 0
      ? await loadWorld(db)
      : { allStateIds: [], stateIdsByCountry: new Map(), countryByState: new Map() };
  const result: CrisisV2TurnResult = { processed: 0, failed: 0, resolved: 0, opened: 0 };
  const stillActive: DirectorActiveCrisis[] = [];

  const runnable: { crisis: LiveCrisis; def: CrisisDefinition }[] = [];
  const missingDefinitions = new Set<string>();
  for (const crisis of crises) {
    const def = getCrisisDefinition(crisis.v2.definitionId);
    const lastSample = Math.max(
      crisis.v2.severityHistory.at(-1)?.turn ?? -Infinity,
      crisis.v2.lastEvaluatedTurn ?? -Infinity
    );
    if (!def) {
      missingDefinitions.add(crisis.v2.definitionId);
    } else if (lastSample < turn) {
      runnable.push({ crisis, def });
    }
    stillActive.push({
      definitionId: crisis.v2.definitionId,
      scope: crisis.v2.scope,
      stage: crisis.v2.stage,
      countryIds: crisisCountryIds(crisis, world),
      startTurn: crisis.v2.startTurn,
    });
  }
  if (missingDefinitions.size > 0) {
    logger.warn(COMPONENT, "crises reference unregistered definitions; left untouched", {
      definitions: [...missingDefinitions],
    });
  }

  if (runnable.length > 0) {
    const defs = new Map(runnable.map(({ def }) => [def.id, def]));
    const countryIds = new Set(runnable.flatMap(({ crisis }) => crisisCountryIds(crisis, world)));
    const ids = runnable.map(({ crisis }) => crisis._id);
    const needsHolders = runnable.some(
      ({ crisis }) =>
        crisis.v2.stage === "signal" || crisis.v2.stage === "onset" || crisis.v2.stage === "peak"
    );
    const [inputs, leverRows, holderMaps] = await Promise.all([
      loadInputs(db, turn, defs, countryIds, world),
      db
        .collection<CrisisLeverUse>("crisisLeverUses")
        .find({ crisisId: { $in: ids }, appliedTurn: null, chargeState: { $ne: "pending" } })
        .toArray(),
      needsHolders ? loadHolders(db, turn, countryIds) : Promise.resolve([]),
    ]);
    const footprints = needsHolders
      ? await loadFootprints(db, turn, holderMaps)
      : new Map<string, HolderFootprint>();
    const usesByCrisis = new Map<string, CrisisLeverUse[]>();
    for (const row of leverRows) {
      const key = row.crisisId.toString();
      usesByCrisis.set(key, [...(usesByCrisis.get(key) ?? []), row]);
    }

    const effectRegistry = getCrisisEffectRegistry();
    const writes: AnyBulkWriteOperation<Crisis>[] = [];
    const consumedUseIds: ObjectId[] = [];
    const unsupportedTotals: Record<string, number> = {};
    const missingModules = new Set<string>();
    const resolvedCrises: LiveCrisis[] = [];
    const afterWrite: (() => Promise<void>)[] = [];

    for (const { crisis, def } of runnable) {
      try {
        if (!(await claimTurn(db, crisis._id, turn))) continue;
        const crisisCountries = crisisCountryIds(crisis, world);
        const driverInputs: Record<string, number> = {};
        for (const driver of def.severity.drivers) {
          const byCountry = inputs.get(driver.input);
          if (!byCountry) continue;
          driverInputs[driver.input] = mean(
            crisisCountries.flatMap((id) =>
              byCountry.has(id) ? [byCountry.get(id) as number] : []
            )
          );
        }

        const rows = usesByCrisis.get(crisis._id.toString()) ?? [];
        const leverUses: LeverUse[] = rows.map((row) => ({
          leverId: row.leverId,
          holderId: row.holderId,
          intensity: row.intensity,
        }));

        const before = crisis.v2;
        const step = computeSeverityStep(before, def, { turn, driverInputs, leverUses });
        let next = recordLeverUses(before, step.accepted, turn);
        const stateIds = crisisStateIds(crisis, world);
        const reach: CrisisReach = {
          scope: before.scope,
          stateIds: new Set(stateIds),
          sectors: def.affectedSectors,
        };
        const exposed = filterExposedHolders(
          mergeHolders(holderMaps, crisisCountries),
          footprints,
          reach
        );
        next = recordInaction(next, def, exposed, turn);
        next = applySeverityStep(next, step, turn);
        next = applyTransition(next, nextStage(next, def, step.after, turn), turn);
        const laid = layScars(
          def,
          next,
          scarTargets(next.scope, crisisCountries, crisis.regionIds),
          turn
        );
        if (laid.length > 0) next = { ...next, scars: [...next.scars, ...laid] };
        const forced = stepForcedEvents(def, next);
        next = { ...next, forced: forced.progress, lastEvaluatedTurn: turn };
        if (forced.fired.some((threshold) => threshold.event === "stateOfEmergency")) {
          next = { ...next, emergency: true };
        }
        const settling =
          !next.consequencesSettled && (next.stage === "aftermath" || next.stage === "resolved");
        if (settling) next = { ...next, consequencesSettled: true };

        const evaluation = evaluateEffectModules(def.effectModules, effectRegistry, {
          instance: next,
          severity: next.severity,
          stage: next.stage,
          turn,
          countryIds: crisisCountries,
          regionIds: crisis.scope === "region" ? crisis.regionIds : [],
        });
        for (const id of evaluation.missing) missingModules.add(id);
        const intents: EffectIntent[] =
          next.emergency && next.stage !== "resolved"
            ? [...evaluation.intents, { kind: "approval", delta: EMERGENCY_APPROVAL_DRIFT }]
            : evaluation.intents;
        let v2Output: CrisisV2Output | undefined;
        if (intents.length > 0) {
          const routing = await routeEffectIntents(db, intents, {
            stateIds,
            countryIds: crisisCountries,
            crisisId: crisis._id,
            turn,
          });
          v2Output = routing.v2Output;
          for (const [kind, count] of Object.entries(routing.unsupported)) {
            unsupportedTotals[kind] = (unsupportedTotals[kind] ?? 0) + count;
          }
        }

        const resolving = next.stage === "resolved";
        writes.push({
          updateOne: {
            filter: { _id: crisis._id, status: "active" },
            update: {
              $set: {
                v2: next,
                ...(v2Output ? { v2Output } : {}),
                ...(laid.length > 0 ? { scarsHealUntil: scarHorizon(next.scars) } : {}),
                ...(resolving ? { status: "resolved", endTurn: turn, resolvedAt: new Date() } : {}),
              },
            },
          },
        });
        for (const row of rows) consumedUseIds.push(row._id);
        if (settling) {
          afterWrite.push(async () => {
            await settleCrisisConsequences(
              db,
              next,
              { crisisId: crisis._id, scope: next.scope, regionIds: crisis.regionIds },
              turn
            );
          });
        }
        if (forced.fired.length > 0) {
          afterWrite.push(async () => {
            await runForcedEvents(db, forced.fired, {
              crisisId: crisis._id.toString(),
              label: def.label,
              stateIds,
              countryIds: crisisCountries,
              turn,
              def,
            });
          });
        }
        if (resolving) {
          resolvedCrises.push(crisis);
          result.resolved += 1;
          const index = stillActive.findIndex(
            (active) =>
              active.definitionId === before.definitionId && active.startTurn === before.startTurn
          );
          if (index >= 0) stillActive[index] = { ...stillActive[index], stage: "resolved" };
        }
        result.processed += 1;
      } catch (error) {
        result.failed += 1;
        logger.error(COMPONENT, "crisis step failed; skipped this turn", error, {
          crisisId: crisis._id.toString(),
          definitionId: def.id,
        });
      }
    }

    if (missingModules.size > 0) {
      logger.warn(COMPONENT, "definitions reference unregistered effect modules", {
        modules: [...missingModules],
      });
    }
    if (Object.keys(unsupportedTotals).length > 0) {
      logger.warn(COMPONENT, "unsupported intent kinds dropped", unsupportedTotals);
    }

    if (writes.length > 0) {
      try {
        await db.collection<Crisis>("crises").bulkWrite(writes, { ordered: false });
        if (consumedUseIds.length > 0) {
          await db
            .collection<CrisisLeverUse>("crisisLeverUses")
            .updateMany({ _id: { $in: consumedUseIds } }, { $set: { appliedTurn: turn } });
        }
        for (const run of afterWrite) {
          try {
            await run();
          } catch (error) {
            logger.error(COMPONENT, "consequence step failed after the crisis was saved", error);
          }
        }
      } catch (error) {
        logger.error(COMPONENT, "writing crisis state failed", error);
        result.failed += writes.length;
        result.processed -= writes.length;
        result.resolved = 0;
        resolvedCrises.length = 0;
      }
    }
    for (const crisis of resolvedCrises) {
      if (!crisis.wireMessageOnEnd) continue;
      try {
        await logWireEvent("crisis_end", crisis.wireMessageOnEnd, {
          href: `/world/crises/${crisis._id.toString()}`,
        });
      } catch (error) {
        logger.warn(COMPONENT, "closing wire event failed", { error: String(error) });
      }
    }
  }

  try {
    await processCrisisScars(db, turn);
  } catch (error) {
    logger.error(COMPONENT, "scar pass failed", error);
  }
  result.opened = await openNewCrises(db, turn, stillActive);
  return result;
}
