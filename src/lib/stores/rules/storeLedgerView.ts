/**
 * A store's last settled turn laid out for its page: goods bought wholesale,
 * what households paid, markup earned and running costs, in daily-rate money
 * like every other sector figure. The rows add up by construction.
 */
import { storeLedger } from "./storeRules";

export interface StoreLedgerView {
  turn: number;
  /** Wholesale value of goods bought from producers, by commodity. */
  goodsBoughtWholesale: number;
  wholesaleByCommodity: { commodity: string; value: number }[];
  /** What households paid the store: wholesale plus markup. */
  soldToHouseholds: number;
  markupEarned: number;
  runningCosts: number;
  /** Wages, site bills, running inputs, and anything else the bill carried. */
  runningCostRows: { key: "wages" | "site" | "inputs" | "other"; value: number }[];
  /** Markup earned minus running costs. */
  margin: number;
  /** Markup as a share of the wholesale value, the rate charged that turn; null with no sales. */
  markupRate: number | null;
  /**
   * Share of the store's capacity its sales needed. A store runs, staffs and
   * buys running supplies only for that share; the rest stands idle on its
   * upkeep. Null when the receipt does not say.
   */
  capacityUsedShare: number | null;
}

/** Per-turn receipt figures in, daily-rate view out. */
export function storeLedgerView(input: {
  turn: number;
  turnsPerDay: number;
  receipt: {
    store: {
      goodsBoughtWholesale: number;
      markupEarned: number;
      wholesaleByCommodity: Record<string, number>;
    };
    profit: number;
    labourPaid: number;
    otherOperatingPaid: number;
    inputsConsumed: number;
    /** Capacity units the store ran, and could have run, that turn. */
    producedUnits?: number;
    offeredUnits?: number;
  };
}): StoreLedgerView {
  const { receipt, turnsPerDay } = input;
  const markup = receipt.store.markupEarned;
  // Running costs are what the markup did not keep, so margin is exactly the receipt's profit.
  const running = Math.max(0, markup - receipt.profit);
  const wages = Math.max(0, receipt.labourPaid);
  const site = Math.max(0, receipt.otherOperatingPaid);
  const inputs = Math.max(0, receipt.inputsConsumed);
  const other = running - wages - site - inputs;
  const ledger = storeLedger({
    goodsBoughtWholesale: receipt.store.goodsBoughtWholesale,
    markupEarned: markup,
    runningCosts: running,
  });
  const daily = (n: number) => n * turnsPerDay;
  return {
    turn: input.turn,
    goodsBoughtWholesale: daily(ledger.goodsBoughtWholesale),
    wholesaleByCommodity: Object.entries(receipt.store.wholesaleByCommodity)
      .filter(([, value]) => value > 0)
      .map(([commodity, value]) => ({ commodity, value: daily(value) }))
      .sort((a, b) => b.value - a.value || (a.commodity < b.commodity ? -1 : 1)),
    soldToHouseholds: daily(ledger.soldToHouseholds),
    markupEarned: daily(ledger.markupEarned),
    runningCosts: daily(ledger.runningCosts),
    runningCostRows: [
      { key: "wages", value: daily(wages) },
      { key: "site", value: daily(site) },
      { key: "inputs", value: daily(inputs) },
      { key: "other", value: daily(other) },
    ],
    margin: daily(ledger.margin),
    markupRate:
      ledger.goodsBoughtWholesale > 0 ? ledger.markupEarned / ledger.goodsBoughtWholesale : null,
    capacityUsedShare:
      receipt.offeredUnits != null && receipt.offeredUnits > 0 && receipt.producedUnits != null
        ? Math.min(1, Math.max(0, receipt.producedUnits / receipt.offeredUnits))
        : null,
  };
}
