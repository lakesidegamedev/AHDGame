// src/lib/turn/npp/capacityWriteback.ts
/**
 * Cohort capacity write-back for NPP corporation turns.
 *
 * Everything the cohort writes about capacity after deciding: capex ledger
 * legs, founded sector inserts, and bulk flushes. Pure except
 * for the final bulk writes.
 */
import { ObjectId, type Db } from "mongodb";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { type BuildCapexTxInput } from "@/lib/corporations/capexTxLog";
import {
  persistNppMarketEntryFunnelBestEffort,
  type NppMarketEntryDiagnostic,
} from "@/lib/turn/npp/entryDiagnostics";
import { recordCapacityDecisionBulkBestEffort } from "@/lib/corporations/capacityDecisionTelemetry/persistence";
import type { CapacityDecisionObservation } from "@/lib/corporations/capacityDecisionTelemetry/rules";
import type { NppOperatorObservation } from "@/lib/corporations/nppOperatorTelemetry/rules";
import { recordNppOperatorObservationsBestEffort } from "@/lib/corporations/nppOperatorTelemetry/persistence";
import type { NppCorpDecision } from "@/lib/turn/npp/corpDecisionTypes";

import {
  prepareNppReinvestmentCashWitnesses,
  type NppReinvestmentCashWitness,
} from "./reinvestmentCashLedger";
import type { NppCorpUpdateOp } from "./nppCashWrite";

export type NppReinvestmentList = NonNullable<NppCorpDecision["reinvestments"]>;
export type NppNewSectorList = NonNullable<NppCorpDecision["newSectors"]>;

/**
 * Capex ledger legs for NPP capacity reinvestment. A build is a cash-to-CIP
 * reclass, and the shadow ledger drops rows with no anchor value, so every
 * row carries both the local and anchor magnitude.
 */
export function appendNppReinvestCapexRows(
  rows: BuildCapexTxInput[],
  args: {
    corp: Pick<Corporation, "_id" | "name" | "sequentialId">;
    corpCurrency: CurrencyCode;
    reinvestments: NppReinvestmentList;
    turn: number;
    now: Date;
  }
): void {
  for (const r of args.reinvestments) {
    rows.push({
      corporationId: args.corp._id,
      corporationName: args.corp.name ?? "NPP corporation",
      corporationSequentialId: args.corp.sequentialId,
      direction: "build",
      amountLocal: Math.abs(r.costLocal),
      currencyCode: args.corpCurrency,
      anchorAmount: Math.abs(r.costAnchor),
      turn: args.turn,
      createdAt: args.now,
      sectorId: r.sectorId,
      sectorType: r.sectorType,
      units: r.units,
      meta: { source: "npp_reinvestment", onlineTurn: r.onlineTurn },
    });
  }
}

export type NppFoundedSectorInsert = Omit<CorporateSector, "_id"> & { _id: ObjectId };

/**
 * Founded-sector inserts for this corp's entries. Plants births grow via build
 * orders, never via the growth slider, and carry the same shape
 * `expandSector` gives a player's new sector.
 */
export function buildNppFoundedSectorInserts(args: {
  corporationId: ObjectId;
  newSectors: NppNewSectorList;
  blocked: ReadonlySet<CountryId>;
  turn: number;
  now: Date;
}): NppFoundedSectorInsert[] {
  const inserts: NppFoundedSectorInsert[] = [];
  for (const ns of args.newSectors) {
    if (args.blocked.has(ns.countryId as CountryId)) continue; // belt and braces
    inserts.push({
      _id: new ObjectId(),
      corporationId: args.corporationId,
      countryId: ns.countryId as CountryId,
      stateId: ns.stateId,
      sectorType: ns.sectorType,
      nppFoundedTurn: args.turn,
      ...(ns.industryModel ? { industryModel: ns.industryModel } : {}),
      ...(ns.mediaDiscriminator ? { mediaDiscriminator: ns.mediaDiscriminator } : {}),
      targetGrowthRate: ns.starterOrder ? 0 : 2,
      currentGrowthRate: 0,
      currentGrowthCost: 0,
      revenue: ns.revenue,
      profitMargin: ns.profitMargin,
      ...(ns.strategyId ? { strategyId: ns.strategyId } : {}),
      workers: 100,
      createdAt: args.now,
      updatedAt: args.now,
      ...(ns.starterOrder
        ? {
            capitalStock: 0,
            plantCount: 0,
            plantUnitRemainder: 0,
            buildQueue: [ns.starterOrder],
            plantsStartTurn: args.turn,
          }
        : {}),
    });
  }
  return inserts;
}

/**
 * Prepare cash-history intents, then persist entry and capacity diagnostics.
 * The authoritative corporation writer publishes accepted capex after cash lands.
 */
export async function flushNppCapacityWriteback(
  db: Db,
  args: {
    turn: number;
    now: Date;
    entryDiagnostics: NppMarketEntryDiagnostic[];
    capexRows: BuildCapexTxInput[];
    cashOperations: NppCorpUpdateOp[];
    shadowEnabled: boolean;
    capacityObservations: readonly CapacityDecisionObservation[];
    operatorObservations: readonly NppOperatorObservation[];
  }
): Promise<NppReinvestmentCashWitness[]> {
  const pending = await prepareNppReinvestmentCashWitnesses(
    db,
    args.capexRows,
    args.cashOperations,
    args.shadowEnabled
  );
  await persistNppMarketEntryFunnelBestEffort(db, args.turn, args.now, args.entryDiagnostics);
  await recordCapacityDecisionBulkBestEffort(db, args.turn, args.capacityObservations);
  await recordNppOperatorObservationsBestEffort(db, args.turn, args.now, args.operatorObservations);
  return pending;
}
