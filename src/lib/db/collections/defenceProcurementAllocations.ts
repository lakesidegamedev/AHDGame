import type { Db } from "mongodb";
import {
  defenceContractLotCaps,
  defenceContractWindow,
  defenceSupplierCapShare,
  type DefenceContractLotCaps,
  type DefenceContractWindow,
} from "@/lib/military/defenceContractLimits";

export interface DefenceProcurementAllocation {
  _id: string;
  countryId: string;
  windowIndex: number;
  startTurn: number;
  endTurn: number;
  countryAmount: number;
  supplierAmounts: Record<string, number>;
  governmentTenderReservations?: Record<
    string,
    { state: "held" | "converted" | "released"; amount: number; corporationId?: string }
  >;
  governmentDirectOfferWithdrawals?: Record<string, boolean>;
  updatedAt: Date;
}

export interface DefenceContractAvailability extends DefenceContractLotCaps {
  window: DefenceContractWindow;
  countryUsed: number;
  supplierUsed: number;
  countryRemaining: number;
  supplierRemaining: number;
  maxLots: number;
}

function allocations(db: Db) {
  return db.collection<DefenceProcurementAllocation>("defenceProcurementAllocations");
}

function supplierField(corporationId: string): string {
  return `supplierAmounts.${corporationId}`;
}

/** The current quota window's allocation document, for callers quoting many suppliers at once. */
export async function getDefenceContractAllocation(
  db: Db,
  countryId: string,
  currentTurn: number
): Promise<DefenceProcurementAllocation | null> {
  const window = defenceContractWindow(countryId, currentTurn);
  return allocations(db).findOne({ _id: window.id });
}

export async function getDefenceContractAvailability(
  db: Db,
  input: {
    countryId: string;
    corporationId: string;
    currentTurn: number;
    defenseLine: number;
    pricePerLot: number;
    /** National Corporations skip the private anti-dumping cap (ticket #1134). */
    stateOwned?: boolean;
    /**
     * Already-loaded allocation document. The cabinet briefing quotes every
     * supplier against the same window, and reading it once here replaces one
     * identical findOne per supplier.
     */
    allocation?: DefenceProcurementAllocation | null;
  }
): Promise<DefenceContractAvailability> {
  const window = defenceContractWindow(input.countryId, input.currentTurn);
  const caps = defenceContractLotCaps(input.defenseLine, input.pricePerLot);
  const share = defenceSupplierCapShare(input.stateOwned === true);
  const allocation =
    input.allocation !== undefined
      ? input.allocation
      : await allocations(db).findOne({ _id: window.id });
  const countryAmount = allocation?.countryAmount ?? 0;
  const supplierAmount = allocation?.supplierAmounts?.[input.corporationId] ?? 0;
  const countryRemainingAmount = Math.max(0, caps.procurementNotional - countryAmount);
  const supplierRemainingAmount = Math.max(0, caps.procurementNotional * share - supplierAmount);
  const countryUsed = Math.floor(countryAmount / input.pricePerLot);
  const supplierUsed = Math.floor(supplierAmount / input.pricePerLot);
  const countryRemaining = Math.floor(countryRemainingAmount / input.pricePerLot);
  const supplierRemaining = Math.floor(supplierRemainingAmount / input.pricePerLot);
  return {
    ...caps,
    supplierLots: caps.countryLots > 0 ? Math.max(1, Math.floor(caps.countryLots * share)) : 0,
    window,
    countryUsed,
    supplierUsed,
    countryRemaining,
    supplierRemaining,
    maxLots: Math.min(countryRemaining, supplierRemaining),
  };
}

/** Release quota after an offer is declined, withdrawn, or fails to persist. */
export async function releaseDefenceContractLots(
  db: Db,
  allocationWindowId: string,
  corporationId: string,
  amount: number
): Promise<void> {
  const released = Math.max(0, Math.floor(amount));
  if (released <= 0) return;
  const field = supplierField(corporationId);
  await allocations(db).updateOne(
    {
      _id: allocationWindowId,
      countryAmount: { $gte: released },
      [field]: { $gte: released },
    },
    {
      $inc: { countryAmount: -released, [field]: -released },
      $set: { updatedAt: new Date() },
    }
  );
}
