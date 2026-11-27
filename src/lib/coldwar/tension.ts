/**
 * Tension events and turn decay persist the world's shared pressure state.
 * applyTensionEvent uses planTensionEvent and optional durable event identities
 * so claimed outcome retries cannot duplicate or omit a discrete shock.
 */
import { withSessionDb } from "@/lib/db/sessionDb";
import { planTensionEvent } from "./rules/tensionEvent";
import { stepBlocDyads, type BlocPairId } from "./rules/blocTension";
import type { Db } from "mongodb";
import { coldWarTensionCollection } from "@/lib/db/repositories/coldWarTension";

/**
 * Global cold-war tension: one 0-100 number the whole world shares, with a
 * short ledger of what moved it.
 *
 * Discrete events (a nuclear test, an escalation rung, a stand-down) apply
 * spikes through `applyTensionEvent`. Each turn, the tension phase relaxes the
 * value toward a floor set by the world's standing pressure: the Vietnam
 * rung, active crises, how many warheads exist, and active shooting wars.
 * Discrete relief cannot cross that floor, so a hot world never reads calm.
 * The dials layer (lib/coldwar/dials.ts) turns the reading into consequences:
 * DEFCON, procurement demand, detente goodwill.
 */

const COLD_WAR_TENSION_ID = "current";

export * from "./rules/tension";
import {
  TENSION_BASELINE,
  clampTension,
  tensionFloor,
  stepTension,
  type ColdWarTensionState,
  type TensionEventKind,
  type TensionPressures,
} from "./rules/tension";

function emptyTensionState(): ColdWarTensionState {
  return {
    value: TENSION_BASELINE,
    pressureFloor: TENSION_BASELINE,
    updatedTurn: 0,
    events: [],
    updatedAt: new Date(0),
  };
}

type StoredState = ColdWarTensionState & { _id: string };

export async function getColdWarTension(db: Db): Promise<ColdWarTensionState> {
  const doc = await coldWarTensionCollection<StoredState>(db).findOne({ _id: COLD_WAR_TENSION_ID });
  if (!doc) return emptyTensionState();
  return {
    value: clampTension(doc.value ?? TENSION_BASELINE),
    pressureFloor: clampTension(doc.pressureFloor ?? TENSION_BASELINE),
    updatedTurn: doc.updatedTurn ?? 0,
    events: doc.events ?? [],
    updatedAt: doc.updatedAt ?? new Date(0),
    ...(doc.blocDyads ? { blocDyads: doc.blocDyads } : {}),
    ...(doc.appliedEventIds ? { appliedEventIds: doc.appliedEventIds } : {}),
  };
}

async function putColdWarTension(db: Db, state: ColdWarTensionState): Promise<void> {
  const projection = { ...state, updatedAt: new Date() };
  // Only keyed event CAS writes this receipt list; ordinary writers may hold an older snapshot.
  delete projection.appliedEventIds;
  await coldWarTensionCollection<StoredState>(db).updateOne(
    { _id: COLD_WAR_TENSION_ID },
    { $set: projection },
    { upsert: true }
  );
}

/** Apply a discrete spike (or relief, negative delta) and record it. */
async function applyTensionEventInTransaction(
  db: Db,
  turn: number,
  kind: TensionEventKind,
  label: string,
  delta: number,
  options: { minimumValue?: number; eventId?: string } = {}
): Promise<ColdWarTensionState> {
  let state = await getColdWarTension(db);
  if (options.eventId === undefined) {
    const next = planTensionEvent(
      state,
      turn,
      kind,
      label,
      delta,
      options.minimumValue,
      new Date()
    );
    await putColdWarTension(db, next);
    return next;
  }
  if (!options.eventId.trim() || options.eventId.length > 500 || !Number.isFinite(delta))
    throw new Error("Invalid keyed tension event");
  if (state.appliedEventIds?.includes(options.eventId)) return state;
  const collection = coldWarTensionCollection<StoredState>(db);
  await collection.updateOne(
    { _id: COLD_WAR_TENSION_ID },
    { $setOnInsert: emptyTensionState() },
    { upsert: true }
  );
  // bounded-cas-retry(maxAttempts=3): Retry only a concurrent write to the shared event state.
  for (let attempt = 0; attempt < 3; attempt++) {
    state = await getColdWarTension(db);
    if (state.appliedEventIds?.includes(options.eventId)) return state;
    if ((state.appliedEventIds?.length ?? 0) >= 10_000)
      throw new Error("Tension event replay ledger exceeds the safe limit");
    const next = planTensionEvent(
      state,
      turn,
      kind,
      label,
      delta,
      options.minimumValue,
      new Date()
    );
    next.appliedEventIds = [...(state.appliedEventIds ?? []), options.eventId];
    const written = await collection.updateOne(
      {
        _id: COLD_WAR_TENSION_ID,
        value: state.value,
        $or: [{ events: state.events }, { events: { $exists: false } }],
        appliedEventIds: state.appliedEventIds ?? { $exists: false },
      },
      { $set: { ...next, updatedAt: new Date() } }
    );
    if (written.matchedCount === 1) return next;
  }
  throw new Error("Tension state changed during event claim; retry");
}

/**
 * The per-turn tension step: relax toward the standing-pressure floor.
 * Idempotent per turn: a re-run of the same turn is a no-op.
 */
async function runTensionTurnInTransaction(
  db: Db,
  turn: number,
  pressures: TensionPressures,
  /** Per-pair floors in a multipolar (2027+) world; omitted elsewhere. */
  blocFloors?: Record<BlocPairId, number>
): Promise<ColdWarTensionState> {
  const state = await getColdWarTension(db);
  if (state.updatedTurn >= turn) return state;
  const pressureFloor = tensionFloor(pressures);
  const next: ColdWarTensionState = {
    ...state,
    value: stepTension(state.value, pressures),
    pressureFloor,
    updatedTurn: turn,
    ...(blocFloors ? { blocDyads: stepBlocDyads(state.blocDyads, blocFloors) } : {}),
  };
  await putColdWarTension(db, next);
  return next;
}

/** Serialize event publication with standing-pressure refreshes on the shared state. */
export async function applyTensionEvent(
  db: Db,
  turn: number,
  kind: TensionEventKind,
  label: string,
  delta: number,
  options: { minimumValue?: number; eventId?: string } = {}
): Promise<ColdWarTensionState> {
  return withSessionDb(db, (db) =>
    applyTensionEventInTransaction(db, turn, kind, label, delta, options)
  );
}
export async function runTensionTurn(
  db: Db,
  turn: number,
  pressures: TensionPressures,
  blocFloors?: Record<BlocPairId, number>
): Promise<ColdWarTensionState> {
  return withSessionDb(db, (db) => runTensionTurnInTransaction(db, turn, pressures, blocFloors));
}
