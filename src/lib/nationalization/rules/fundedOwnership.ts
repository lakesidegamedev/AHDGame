/** Physical stock and unpaid bills move at their existing basis, without moving cash. */
import type { ProducerInventoryState, ProducerPayablesState } from "@/lib/db/types/producerEconomy";
import { producerPayableId, type ProducerPayable } from "@/lib/market/producerMarket/payablesRules";

export function producerStockBookAnchor(stock?: ProducerInventoryState): number {
  return (
    (stock?.inputStock ?? []).reduce((n, s) => n + s.value, 0) +
    (stock?.outputStock ?? []).reduce((n, s) => n + s.units * (s.quoteUnitCost ?? 0), 0)
  );
}

export function producerDebtAnchor(state?: ProducerPayablesState, siteId?: string): number {
  return (state?.claims ?? [])
    .filter((c) => !siteId || c.producerId === siteId)
    .reduce((n, c) => n + c.amount, 0);
}

export function mergeFundedInventory(
  a?: ProducerInventoryState,
  b?: ProducerInventoryState
): ProducerInventoryState | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.worldEpoch !== b.worldEpoch || a.turn !== b.turn)
    throw new Error("Cannot merge inventory generations");
  return {
    ...a,
    inputStock: [...a.inputStock, ...b.inputStock],
    outputStock: [...a.outputStock, ...b.outputStock],
  };
}

export function splitFundedInventory(stock: ProducerInventoryState, fraction: number) {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
    throw new Error("Invalid stock fraction");
  const split = <T extends { units: number; value?: number }>(rows: T[]) => {
    const moved = rows.map((row) => ({
      ...row,
      units: row.units * fraction,
      ...(row.value === undefined ? {} : { value: row.value * fraction }),
    }));
    const kept = rows.map((row, i) => ({
      ...row,
      units: row.units - moved[i].units,
      ...(row.value === undefined ? {} : { value: row.value - (moved[i].value ?? 0) }),
    }));
    if (
      rows.some(
        (row) =>
          !Number.isFinite(row.units) ||
          row.units < 0 ||
          (row.value !== undefined && (!Number.isFinite(row.value) || row.value < 0))
      )
    )
      throw new Error("Invalid funded stock");
    return { moved, kept };
  };
  const inputs = split(stock.inputStock),
    outputs = split(stock.outputStock);
  return {
    moved: { ...stock, inputStock: inputs.moved, outputStock: outputs.moved },
    kept: { ...stock, inputStock: inputs.kept, outputStock: outputs.kept },
  };
}

export function transferProducerClaims(input: {
  source: ProducerPayablesState;
  destination?: ProducerPayablesState;
  destinationAccountId: string;
  sites?: ReadonlyMap<string, { producerId: string; fraction: number }>;
}) {
  if (input.destination && input.source.worldEpoch !== input.destination.worldEpoch)
    throw new Error("Cannot combine producer liabilities from different generations");
  const kept: ProducerPayable[] = [],
    moved: ProducerPayable[] = [];
  for (const claim of input.source.claims) {
    const site = input.sites?.get(claim.producerId);
    const fraction = input.sites ? (site?.fraction ?? 0) : 1;
    if (
      !Number.isFinite(fraction) ||
      fraction < 0 ||
      fraction > 1 ||
      !Number.isFinite(claim.amount) ||
      claim.amount < 0
    )
      throw new Error("Invalid liability transfer");
    const amount = claim.amount * fraction;
    if (amount > 0) {
      const next = {
        ...claim,
        amount,
        debtorAccountId: input.destinationAccountId,
        producerId: site?.producerId ?? claim.producerId,
      };
      moved.push({ ...next, id: producerPayableId(next) });
    }
    if (claim.amount - amount > 0) kept.push({ ...claim, amount: claim.amount - amount });
  }
  const merged = new Map<string, ProducerPayable>();
  for (const claim of [...(input.destination?.claims ?? []), ...moved]) {
    if (!Number.isFinite(claim.amount) || claim.amount < 0)
      throw new Error("Invalid destination liability");
    const previous = merged.get(claim.id);
    if (!Number.isFinite((previous?.amount ?? 0) + claim.amount))
      throw new Error("Liability transfer overflow");
    merged.set(claim.id, {
      ...claim,
      amount: (previous?.amount ?? 0) + claim.amount,
      ...(previous?.notShrinkingSince == null
        ? {}
        : {
            notShrinkingSince: Math.min(
              previous.notShrinkingSince,
              claim.notShrinkingSince ?? previous.notShrinkingSince
            ),
          }),
    });
  }
  return {
    kept: { ...input.source, claims: kept },
    moved: {
      ...input.source,
      turn: Math.max(input.source.turn, input.destination?.turn ?? input.source.turn),
      claims: [...merged.values()],
    },
  };
}

/** Persistent unpaid operating bills count as distress once their credit runway has expired. */
export function hasProducerDistress(
  state: ProducerPayablesState | null | undefined,
  turn: number,
  stuckTurns: number
): boolean {
  return (
    state?.claims.some(
      (c) => c.amount > 0 && c.notShrinkingSince != null && turn - c.notShrinkingSince >= stuckTurns
    ) ?? false
  );
}

/** Inventory receives its recorded basis rather than a replacement-cost premium. */
export function inventoryInclusiveCompensationBase(
  bookAnchor: number,
  stock: ProducerInventoryState | undefined,
  premium: number
): number {
  if (!(premium > 0) || !Number.isFinite(premium)) throw new Error("Invalid compensation premium");
  return bookAnchor + producerStockBookAnchor(stock) / premium;
}
