import type { Db } from "mongodb";
import { livingVietnamAsLegacyState } from "@/lib/livingConflict/vietnamCompat";
import { listNuclearPrograms } from "@/lib/db/collections/nuclearPrograms";
import { getConflictsCollection, listActiveConflicts } from "@/lib/db/collections/conflicts";
import type { ConflictDoc } from "@/lib/db/types/conflict";
import type { CountryId } from "@/lib/constants/countries";
import {
  nuclearArmedCountryIds,
  warPressures,
  WAR_ACCLIMATION_HOT_INTENSITY,
  type NuclearProgramPressureInput,
  type TensionPressures,
  type WarPressureInput,
  type WarPressureSummary,
} from "./tension";

export interface StandingPressureInputs {
  escalationLevel: number;
  activeCrises: number;
  programs: NuclearProgramPressureInput[];
  conflicts: WarPressureInput[];
  /** Current turn enables limited-war acclimation. Omit for seed compatibility. */
  currentTurn?: number;
}

export interface StandingPressureSnapshot {
  pressures: TensionPressures;
  warSummary: WarPressureSummary;
  totalWarheads: number;
  /** The wars the pressures were read from, for the 2027 bloc dyads. */
  wars: WarPressureInput[];
  nuclearCountries: ReadonlySet<CountryId>;
}

/** Adapt the canonical conflict document to the pressure model in one place. */
export function conflictWarPressureInput(
  conflict: Pick<ConflictDoc, "sideA" | "sideB" | "intensity" | "limitedWarSinceTurn">
): WarPressureInput {
  return {
    sideACountries: conflict.sideA?.countries ?? [],
    sideBCountries: conflict.sideB?.countries ?? [],
    intensity: conflict.intensity ?? 0,
    limitedWarSinceTurn: conflict.limitedWarSinceTurn,
  };
}

/**
 * Keep the consecutive limited-war clock honest. Hot turns clear it; the first
 * later limited turn starts a new grace period. Both writes are idempotent.
 */
export async function syncLimitedWarPressureClocks(db: Db, currentTurn: number): Promise<void> {
  const conflicts = getConflictsCollection(db);
  await Promise.all([
    conflicts.updateMany(
      {
        status: { $ne: "resolved" },
        intensity: { $gte: WAR_ACCLIMATION_HOT_INTENSITY },
        limitedWarSinceTurn: { $exists: true },
      },
      { $unset: { limitedWarSinceTurn: "" } }
    ),
    conflicts.updateMany(
      {
        status: { $ne: "resolved" },
        intensity: { $lt: WAR_ACCLIMATION_HOT_INTENSITY },
        limitedWarSinceTurn: { $exists: false },
      },
      { $set: { limitedWarSinceTurn: currentTurn } }
    ),
  ]);
}

/** Build the one strategic-pressure snapshot shared by the turn, UI, and seeds. */
export function buildStandingPressureSnapshot(
  input: StandingPressureInputs
): StandingPressureSnapshot {
  const totalWarheads = input.programs.reduce(
    (sum, program) => sum + Math.max(0, program.warheads),
    0
  );
  const nuclearCountries = nuclearArmedCountryIds(input.programs);
  const warSummary = warPressures(input.conflicts, nuclearCountries, input.currentTurn);
  return {
    totalWarheads,
    warSummary,
    wars: input.conflicts,
    nuclearCountries,
    pressures: {
      escalationLevel: input.escalationLevel,
      activeCrises: input.activeCrises,
      totalWarheads,
      nuclearWarIntensity: warSummary.nuclearWarIntensity,
      nuclearWarCount: warSummary.nuclearWarCount,
      nuclearWarMinimumPressure: warSummary.nuclearWarMinimumPressure,
      otherWarIntensity: warSummary.otherWarIntensity,
    },
  };
}

/** Read current standing pressure, including all active crises and conflicts. */
export async function readStandingPressureSnapshot(
  db: Db,
  currentTurn?: number
): Promise<StandingPressureSnapshot> {
  const [vietnam, activeCrises, programs, conflicts] = await Promise.all([
    livingVietnamAsLegacyState(db),
    db.collection("crises").countDocuments({ status: "active" }),
    listNuclearPrograms(db),
    listActiveConflicts(db),
  ]);
  return buildStandingPressureSnapshot({
    escalationLevel: vietnam.level,
    activeCrises,
    programs,
    conflicts: conflicts.map(conflictWarPressureInput),
    currentTurn,
  });
}
