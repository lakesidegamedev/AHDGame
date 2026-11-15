/**
 * Automation levies as real revenue. The automation tax and the pension levy fall on
 * automation methods as a share of what the plant pays for its inputs this turn. In the
 * funded market that share goes from the paying company to the national treasury as a closing
 * transfer, instead of making inputs dearer for suppliers to collect. The sum paid out equals
 * the sum received: nothing is created or lost here.
 *
 * Pure: plain data in, plain data out. The shell supplies the settled trades and the accounts.
 */

/** The levy a plant owes on what it pays for inputs. */
export interface PlantLevy {
  /** Country whose treasury collects the levy. */
  countryId: string;
  /** Fraction of input spend, 0 to `MAX_LEVY_INPUT_PENALTY`. */
  penalty: number;
}

export interface LevyTrade {
  kind: string;
  orderId: string;
  buyerAccountId: string;
  amount: number;
}

export interface LevyTransfer {
  fromAccountId: string;
  toAccountId: string;
  countryId: string;
  amount: number;
}

export interface LevyClose {
  transfers: LevyTransfer[];
  paidByAccount: Map<string, number>;
  collectedByCountry: Map<string, number>;
  /** Owed but not paid because the company's closing cash ran short. */
  shortfall: number;
}

/** The plant an input order belongs to; null for any other order id. */
export function plantOfInputOrder(orderId: string): string | null {
  try {
    const parsed: unknown = JSON.parse(orderId);
    return Array.isArray(parsed) && parsed[1] === "input" && typeof parsed[0] === "string"
      ? parsed[0]
      : null;
  } catch {
    return null;
  }
}

/**
 * One transfer per (company, country): the plant's levy rate on each input sale it settled,
 * capped at the company's remaining closing cash. Internal transfers are not purchases and
 * owe nothing. Order is deterministic so a retried turn plans the same transfers.
 */
export function automationLevyTransfers(input: {
  trades: Iterable<LevyTrade>;
  levyByPlant: ReadonlyMap<string, PlantLevy>;
  /** The country's collection account, or null when it has none. */
  collectorOf: (countryId: string) => string | null;
  /** Company cash after settlement, anchor units. */
  cashOf: (accountId: string) => number;
}): LevyClose {
  const owed = new Map<string, { accountId: string; countryId: string; amount: number }>();
  for (const trade of input.trades) {
    if (trade.kind !== "sale" || !(trade.amount > 0)) continue;
    const plant = plantOfInputOrder(trade.orderId);
    const levy = plant ? input.levyByPlant.get(plant) : undefined;
    if (!levy || !(levy.penalty > 0) || !input.collectorOf(levy.countryId)) continue;
    const key = `${trade.buyerAccountId}|${levy.countryId}`;
    const row = owed.get(key) ?? {
      accountId: trade.buyerAccountId,
      countryId: levy.countryId,
      amount: 0,
    };
    row.amount += trade.amount * levy.penalty;
    owed.set(key, row);
  }

  const transfers: LevyTransfer[] = [];
  const paidByAccount = new Map<string, number>();
  const collectedByCountry = new Map<string, number>();
  const remaining = new Map<string, number>();
  let owedTotal = 0;
  let paidTotal = 0;
  for (const key of [...owed.keys()].sort()) {
    const row = owed.get(key)!;
    owedTotal += row.amount;
    const cash = remaining.get(row.accountId) ?? Math.max(0, input.cashOf(row.accountId));
    const amount = Math.min(row.amount, cash);
    remaining.set(row.accountId, cash - Math.max(0, amount));
    if (!(amount > 0)) continue;
    paidTotal += amount;
    transfers.push({
      fromAccountId: row.accountId,
      toAccountId: input.collectorOf(row.countryId)!,
      countryId: row.countryId,
      amount,
    });
    paidByAccount.set(row.accountId, (paidByAccount.get(row.accountId) ?? 0) + amount);
    collectedByCountry.set(row.countryId, (collectedByCountry.get(row.countryId) ?? 0) + amount);
  }
  return {
    transfers,
    paidByAccount,
    collectedByCountry,
    shortfall: Math.max(0, owedTotal - paidTotal),
  };
}
