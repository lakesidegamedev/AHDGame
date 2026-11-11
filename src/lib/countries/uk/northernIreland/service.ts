/**
 * Ratified peace establishes Northern Ireland's devolved executive through the
 * same election and office registry used by UK devolution. Suspension withdraws
 * authority and preserves historical contests; restoration schedules new races.
 */
import type { Db } from "mongodb";
import type { State, Election, GameState, ElectionCandidate } from "@/lib/db/types";
import type { LivingConflictState } from "@/lib/livingConflict/types";
import { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";
import { readUKDevolutionState, vacateUKRegionalExecutives } from "../devolution/service";
import { UK_EXECUTIVE_FOUNDING_TURNS, type UKDevolutionState } from "../devolution/rules";
import {
  northernIrelandPosture,
  reconcileNorthernIrelandInstitution,
  type NorthernIrelandSignal,
} from "./rules";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";

export async function loadNorthernIrelandSignal(db: Db): Promise<NorthernIrelandSignal | null> {
  return db
    .collection<LivingConflictState>("livingConflicts")
    .findOne(
      { defKey: "northern_ireland" },
      { projection: { hasOpened: 1, status: 1, phaseLevel: 1, tracks: 1 } }
    );
}

export async function reconcileNorthernIrelandGovernance(
  db: Db,
  conflict: LivingConflictState,
  turn: number
): Promise<void> {
  if (!conflict.hasOpened || conflict.status === "closed") return;
  const [region, game] = await Promise.all([
    statesCollection(db).findOne({ _id: "NIR", countryId: "UK" }, { projection: { _id: 1 } }),
    gameStateCollection(db).findOne({ _id: "current" }, { projection: { startingYear: 1 } }),
  ]);
  if (!region) return;
  const startingYear = game?.startingYear ?? 1991;
  const current = await readUKDevolutionState(db, startingYear);
  const posture = northernIrelandPosture(conflict);
  // Existing modern institutions predate this process. Opening a new window
  // alone cannot abolish them; only a negotiated settlement takes ownership.
  if (!current.northernIrelandPeace && startingYear >= 1999 && posture === "unsettled") return;
  if (current.northernIrelandPeace?.posture === posture) return;
  const elections = await electionsCollection(db)
    .find(
      { countryId: "UK", state: "NIR", electionType: { $in: ["governor", "regionalCouncil"] } },
      { projection: { electionType: 1, cycle: 1 } }
    )
    .toArray();
  const latest = (type: string) =>
    Math.max(0, ...elections.filter((e) => e.electionType === type).map((e) => e.cycle));
  const next = reconcileNorthernIrelandInstitution(
    current,
    conflict,
    turn,
    latest("governor"),
    UK_EXECUTIVE_FOUNDING_TURNS,
    latest("regionalCouncil"),
    DEFAULT_DURATIONS.regionalCouncil.durationHours
  );
  if (!next.regions.NIR.active) {
    const now = new Date();
    await vacateUKRegionalExecutives(db, ["NIR"], now);
    const unfinished = await electionsCollection(db)
      .find(
        {
          countryId: "UK",
          state: "NIR",
          electionType: { $in: ["governor", "regionalCouncil"] },
          status: { $in: ["active", "upcoming", "cancelled"] },
        },
        { projection: { _id: 1 } }
      )
      .toArray();
    const ids = unfinished.map((e) => e._id);
    if (ids.length) {
      await electionsCollection(db).updateMany(
        { _id: { $in: ids }, status: { $in: ["active", "upcoming"] } },
        { $set: { status: "cancelled", updatedAt: now } }
      );
      await electionCandidatesCollection(db).updateMany(
        { electionId: { $in: ids }, status: "active" },
        { $set: { status: "withdrawn", withdrawnAt: now } }
      );
    }
  }
  // Persist last. A retry repeats idempotent cleanup after a partial failure.
  await db.collection<UKDevolutionState>("ukDevolution").updateOne(
    { _id: "UK" },
    {
      $set: { regions: next.regions, northernIrelandPeace: next.northernIrelandPeace },
      $setOnInsert: { _id: "UK" },
    },
    { upsert: true }
  );
}

/** Missing metadata preserves legacy institutions until the peace process owns them. */
export async function northernIrelandAssemblySuspended(db: Db): Promise<boolean> {
  const state = await db
    .collection<UKDevolutionState>("ukDevolution")
    .findOne({ _id: "UK" }, { projection: { northernIrelandPeace: 1, "regions.NIR.active": 1 } });
  return Boolean(state?.northernIrelandPeace && !state.regions.NIR.active);
}

export async function northernIrelandAssemblyAllows(
  db: Db,
  countryId: string,
  regionId: string
): Promise<boolean> {
  return countryId !== "UK" || regionId !== "NIR" || !(await northernIrelandAssemblySuspended(db));
}
