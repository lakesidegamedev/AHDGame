import type {
  ProducerInventoryState,
  ProducerGenerationStamp,
  ProducerPayablesState,
} from "@/lib/db/types/producerEconomy";

function validateStamp(worldEpoch: string, turn: number): ProducerGenerationStamp {
  if (!worldEpoch || !Number.isSafeInteger(turn) || turn < 0)
    throw new Error("Producer opening requires a valid world generation");
  return { worldEpoch, turn };
}

/** Empty physical stock at a real completed-turn boundary. */
export function emptyProducerSectorOpening(worldEpoch: string, turn: number) {
  const stamp = validateStamp(worldEpoch, turn);
  const inventory: ProducerInventoryState = {
    ...stamp,
    inputStock: [],
    outputStock: [],
  };
  return {
    producerCapacity: stamp,
    producerInventory: inventory,
  };
}

/** A new corporation has no producer creditors until its first settled trade. */
export function emptyProducerPayables(worldEpoch: string, turn: number): ProducerPayablesState {
  return { ...validateStamp(worldEpoch, turn), claims: [] };
}

/**
 * Producer books for a corporation or sector created after the opening (a new
 * founding): empty, stamped at the last settled turn. Null when the record
 * already has books, or carries legacy value the opening would have converted
 * (stock or arrears), which only a reviewed opening may carry over.
 */
export function newEntrantProducerBooks(
  record: {
    producerCapacity?: unknown;
    producerInventory?: unknown;
    producerPayables?: unknown;
    capacityBookAnchor?: number | null;
    buildQueue?: unknown[] | null;
    inventoryUnits?: Record<string, unknown> | null;
    operatingCashArrearsByCurrency?: Record<string, unknown> | null;
  },
  kind: "sector" | "corporation",
  worldEpoch: string,
  lastSettledTurn: number
):
  | (ReturnType<typeof emptyProducerSectorOpening> & {
      capacityBookAnchor?: number;
      buildQueue?: [];
    })
  | { producerPayables: ProducerPayablesState }
  | null {
  const positive = (m: Record<string, unknown> | null | undefined) =>
    Object.values(m ?? {}).some((v) => typeof v === "number" && v > 0);
  if (kind === "corporation") {
    if (record.producerPayables || positive(record.operatingCashArrearsByCurrency)) return null;
    return { producerPayables: emptyProducerPayables(worldEpoch, lastSettledTurn) };
  }
  if ((record.producerCapacity && record.producerInventory) || positive(record.inventoryUnits))
    return null;
  // A founding records capacity but may carry no paid basis or queue yet; an
  // empty basis lets it produce instead of idling forever.
  return {
    ...emptyProducerSectorOpening(worldEpoch, lastSettledTurn),
    ...(record.capacityBookAnchor == null ? { capacityBookAnchor: 0 } : {}),
    ...(Array.isArray(record.buildQueue) ? {} : { buildQueue: [] as [] }),
  };
}
