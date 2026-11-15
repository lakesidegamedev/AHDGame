import type { MarketAccount } from "./rules";

export interface ProducerCashChange {
  accountId: string;
  change: number;
}

/** Cash movements retain their precision independently of unspent balances. */
export class ProducerCashChanges {
  private readonly totals = new Map<string, { sum: number; correction: number }>();

  constructor(accountIds: Iterable<string>, opening?: readonly ProducerCashChange[]) {
    for (const id of accountIds) {
      if (!id || this.totals.has(id)) throw new Error("Invalid producer cash change account");
      this.totals.set(id, { sum: 0, correction: 0 });
    }
    if (opening) {
      const changes = producerCashChangeMap(opening);
      if (changes.size !== this.totals.size)
        throw new Error("Missing producer cash change witness");
      for (const row of changes) this.add(...row);
    }
  }

  add(accountId: string, change: number): void {
    const total = this.totals.get(accountId);
    if (!total || !Number.isFinite(change)) throw new Error("Invalid producer cash change");
    const next = total.sum + change;
    total.correction +=
      Math.abs(total.sum) >= Math.abs(change)
        ? total.sum - next + change
        : change - next + total.sum;
    total.sum = next;
    if (!Number.isFinite(next) || !Number.isFinite(total.correction))
      throw new Error("Producer cash change overflow");
  }

  transfer(from: string, to: string, amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid producer cash transfer");
    this.add(from, -amount);
    this.add(to, amount);
  }

  rows(): ProducerCashChange[] {
    return [...this.totals]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([accountId, total]) => ({ accountId, change: total.sum + total.correction }));
  }
}

export function producerCashChangeMap(changes: readonly ProducerCashChange[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of changes) {
    if (!row.accountId || out.has(row.accountId) || !Number.isFinite(row.change))
      throw new Error("Invalid producer cash change witness");
    out.set(row.accountId, row.change);
  }
  return out;
}

export function closingProducerCash(
  opening: readonly MarketAccount[],
  changes: readonly ProducerCashChange[],
  reported?: readonly MarketAccount[]
): MarketAccount[] {
  const byId = producerCashChangeMap(changes);
  const prior = reported ? new Map(reported.map((account) => [account.id, account.cash])) : null;
  const openingCash = new Map(opening.map((account) => [account.id, account.cash]));
  if (
    byId.size !== opening.length ||
    openingCash.size !== opening.length ||
    opening.some((account) => !account.id || !Number.isFinite(account.cash) || account.cash < 0) ||
    (reported && (reported.length !== opening.length || prior!.size !== opening.length))
  )
    throw new Error("Missing or invalid producer cash change witness");
  let net = 0;
  let gross = 0;
  for (const change of byId.values()) {
    net += change;
    gross += Math.abs(change);
  }
  if (
    !Number.isFinite(net) ||
    !Number.isFinite(gross) ||
    Math.abs(net) > Math.max(1e-7, gross * 1e-12)
  )
    throw new Error("Producer cash does not conserve value");
  return (reported ?? opening).map((account) => {
    const change = byId.get(account.id);
    if (change == null) throw new Error("Missing producer cash change witness");
    const cash = openingCash.get(account.id)! + change;
    if (!Number.isFinite(cash) || cash < -1e-7)
      throw new Error("Producer cash changes overdraw the opening balance");
    const previous = prior?.get(account.id);
    // Keep byte-stable snapshots when they agree at the absolute settlement precision.
    return {
      id: account.id,
      cash: Math.max(0, previous != null && Math.abs(previous - cash) <= 1e-7 ? previous : cash),
    };
  });
}

/** Two rounded additions can straddle the adjacent representable balances. */
export function producerCashSnapshotTolerance(a: number, b: number): number {
  const magnitude = Math.max(Math.abs(a), Math.abs(b));
  return Math.max(1e-7, magnitude > 0 ? 2 ** (Math.floor(Math.log2(magnitude)) - 51) : 0);
}
