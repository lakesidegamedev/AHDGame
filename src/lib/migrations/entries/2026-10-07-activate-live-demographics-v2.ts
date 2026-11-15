import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { GameState } from "@/lib/db/types/gameState";
import { verifyDemographicsV2Opening } from "@/lib/demographics/v2/verifyOpening";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import {
  resetSeedComplete,
  resetSystemSelectionsFrom,
  resetSystemVersionsFrom,
  demographicsV2OpeningCountries,
} from "@/lib/resetVersions/rules";
import type { Migration, MigrationContext, MigrationResult } from "../types";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

export const LIVE_DEMOGRAPHICS_V2_MIGRATION_ID = "2026-10-07-activate-live-demographics-v2";

const MIGRATION_ACTOR = `migration:${LIVE_DEMOGRAPHICS_V2_MIGRATION_ID}`;
function activationCountries(state: ActivationState): string[] {
  const countries: string[] = [...demographicsV2OpeningCountries(state.preset ?? ""), "IE"];
  if (resetSeedComplete(state, "demographics")) {
    countries.push(...(state.resetVersionSeeds?.demographics?.countries ?? []));
  }
  return [...new Set(countries)];
}

type ActivationState = Pick<
  GameState,
  | "_id"
  | "preset"
  | "currentTurn"
  | "isActive"
  | "isProcessing"
  | "resetWorldId"
  | "resetVersionSeeds"
  | "resetSystemSelections"
  | "demographicsSystemVersion"
>;

const ACTIVATION_PROJECTION = {
  _id: 1,
  preset: 1,
  currentTurn: 1,
  isActive: 1,
  isProcessing: 1,
  resetWorldId: 1,
  resetVersionSeeds: 1,
  resetSystemSelections: 1,
  demographicsSystemVersion: 1,
} as const;

function assertActivatableWorld(state: ActivationState | null): asserts state is ActivationState & {
  currentTurn: number;
  resetWorldId: string;
} {
  if (!state) throw new Error("Cannot activate Demographics v2 without the current gameState");
  if (state.isActive !== true) {
    throw new Error("Demographics v2 live promotion requires the current world to be active");
  }
  if (state.isProcessing) throw new Error("Demographics v2 promotion requires an idle turn runner");
  if (!Number.isSafeInteger(state.currentTurn) || (state.currentTurn ?? 0) < 1) {
    throw new Error("Demographics v2 live promotion requires a valid current turn");
  }
  if (typeof state.resetWorldId !== "string" || state.resetWorldId.length === 0) {
    throw new Error("Demographics v2 live promotion requires an existing reset world identity");
  }
}

function alreadyActivated(state: ActivationState): boolean {
  return (
    resetSystemVersionsFrom(state, RESET_V2_READY).demographics === "v2" &&
    resetSystemSelectionsFrom(state).demographics === "v2" &&
    activationCountries(state).every((countryId) =>
      state.resetVersionSeeds?.demographics?.countries?.includes(countryId)
    )
  );
}

async function activateLiveDemographicsV2(db: Db, ctx: MigrationContext): Promise<MigrationResult> {
  const collection = gameStateCollection(db);
  const state = await collection.findOne({ _id: "current" }, { projection: ACTIVATION_PROJECTION });
  assertActivatableWorld(state);

  if (alreadyActivated(state)) {
    return {
      documentsScanned: 1,
      documentsUpdated: 0,
      notes: ["The active world already has a complete Demographics v2 receipt and selection."],
    };
  }

  const receipt = await verifyDemographicsV2Opening(
    db,
    state.resetWorldId,
    state.currentTurn,
    activationCountries(state) as CountryId[]
  );
  const activatedAt = new Date().toISOString();
  const promotedState: ActivationState = {
    ...state,
    demographicsSystemVersion: "v2",
    resetVersionSeeds: { ...state.resetVersionSeeds, demographics: receipt },
    resetSystemSelections: { ...state.resetSystemSelections, demographics: "v2" },
  };
  if (!alreadyActivated(promotedState) || !resetSeedComplete(promotedState, "demographics")) {
    throw new Error("Demographics v2 receipt did not satisfy the runtime activation contract");
  }

  if (ctx.dryRun) {
    return {
      documentsScanned: 1,
      documentsUpdated: 0,
      notes: [
        `DRY RUN, no writes. Population vectors passed verification for ${receipt.countries?.join(", ")}.`,
        "Apply will atomically install the receipt, activate Demographics v2, and select v2 for the next reset.",
        "SCO and WAL remain deferred until independence creates and verifies their successor-region vectors.",
      ],
    };
  }

  const update = await collection.updateOne(
    {
      _id: "current",
      isActive: true,
      isProcessing: { $ne: true },
      currentTurn: state.currentTurn,
      resetWorldId: state.resetWorldId,
    },
    {
      $set: {
        demographicsSystemVersion: "v2",
        demographicsSystemVersionBy: MIGRATION_ACTOR,
        demographicsSystemVersionAt: activatedAt,
        "resetVersionSeeds.demographics": receipt,
        "resetSystemSelections.demographics": "v2",
        "resetSystemSelectionsAudit.demographics": {
          by: MIGRATION_ACTOR,
          at: activatedAt,
        },
        updatedAt: new Date(activatedAt),
      },
    }
  );
  if (update.matchedCount !== 1) {
    throw new Error(
      "The active world changed during Demographics v2 verification; no activation was applied"
    );
  }

  const activated = await collection.findOne(
    { _id: "current" },
    { projection: ACTIVATION_PROJECTION }
  );
  if (!activated || !alreadyActivated(activated)) {
    throw new Error("Demographics v2 activation did not pass its post-write verification");
  }

  return {
    documentsScanned: 1,
    documentsUpdated: update.modifiedCount,
    notes: [
      `Activated Demographics v2 after verifying population vectors for ${receipt.countries?.join(", ")}.`,
      "Selected Demographics v2 for the next reset without changing any other reset-system selection.",
      "SCO and WAL remain deferred until independence creates and verifies their successor-region vectors.",
    ],
  };
}

export const migration: Migration = {
  id: LIVE_DEMOGRAPHICS_V2_MIGRATION_ID,
  description:
    "Verify the active world's demographic substrate and atomically promote it to Demographics v2",
  idempotent: true,
  execute: activateLiveDemographicsV2,
};
