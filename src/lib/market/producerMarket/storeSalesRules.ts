/**
 * What households bought through stores and direct in one clearing, and what
 * each store earned. Pure: settled orders in, rows and markup transfers out.
 */
import { allocateByWeight, storeMarkupOn, storeRoutedShare } from "@/lib/stores/rules/storeRules";

export interface StoreSaleRow {
  /** The store's sector id. */
  storeId: string;
  accountId: string;
  stateId: string;
  /** Wholesale value of goods bought from producers for the households it served. */
  wholesaleByCommodity: Record<string, number>;
  goodsBoughtWholesale: number;
  /** Markup households paid this store on top of wholesale. */
  markupEarned: number;
  /** Store capacity as a value of goods it could resell. */
  capacityValue: number;
}

export interface HouseholdChannelRow {
  commodity: string;
  stateId: string;
  storeUnits: number;
  storeValue: number;
  directUnits: number;
  directValue: number;
}

export interface StoreCoverageRow {
  /** Goods value the state's stores could resell this turn. */
  capacityValue: number;
  /** Full-run capacity units behind `capacityValue`. */
  runUnits: number;
  /** Household spending asked to go through stores. */
  routedDemandValue: number;
  coverage: number;
}

export interface StoreMarkupTransfer {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
}

export interface StoreSales {
  markup: number;
  stores: StoreSaleRow[];
  channels: HouseholdChannelRow[];
  transfers: StoreMarkupTransfer[];
  /** Per state: resale capacity, routed demand asked for, and the share stores could serve. */
  coverageByState: Record<string, StoreCoverageRow>;
}

export function settleStoreSales(input: {
  markup: number;
  orders: readonly {
    id: string;
    accountId: string;
    commodity: string;
    stateId?: string;
    storeRouted?: true;
  }[];
  results: ReadonlyMap<string, { deliveredUnits: number; cost: number }>;
  householdAccountIds: ReadonlySet<string>;
  stores: readonly { storeId: string; accountId: string; stateId: string; capacityValue: number }[];
  coverageByState: StoreSales["coverageByState"];
}): StoreSales {
  const storesByState = new Map<string, (typeof input.stores)[number][]>();
  for (const s of input.stores) {
    const list = storesByState.get(s.stateId) ?? [];
    list.push(s);
    storesByState.set(s.stateId, list);
  }
  const channels = new Map<string, HouseholdChannelRow>();
  // Wholesale value routed through stores, by state, commodity and paying wallet.
  const routed = new Map<string, Map<string, Map<string, number>>>();
  for (const order of input.orders) {
    if (!input.householdAccountIds.has(order.accountId) || !order.stateId) continue;
    if (storeRoutedShare(order.commodity) <= 0) continue;
    const result = input.results.get(order.id);
    if (!result) continue;
    const key = `${order.stateId}|${order.commodity}`;
    const row =
      channels.get(key) ??
      ({
        commodity: order.commodity,
        stateId: order.stateId,
        storeUnits: 0,
        storeValue: 0,
        directUnits: 0,
        directValue: 0,
      } satisfies HouseholdChannelRow);
    if (order.storeRouted) {
      row.storeUnits += result.deliveredUnits;
      row.storeValue += result.cost;
      const byCommodity = routed.get(order.stateId) ?? new Map<string, Map<string, number>>();
      const byWallet = byCommodity.get(order.commodity) ?? new Map<string, number>();
      byWallet.set(order.accountId, (byWallet.get(order.accountId) ?? 0) + result.cost);
      byCommodity.set(order.commodity, byWallet);
      routed.set(order.stateId, byCommodity);
    } else {
      row.directUnits += result.deliveredUnits;
      row.directValue += result.cost;
    }
    channels.set(key, row);
  }
  const rows = new Map<string, StoreSaleRow>(
    input.stores.map((s) => [
      s.storeId,
      {
        storeId: s.storeId,
        accountId: s.accountId,
        stateId: s.stateId,
        wholesaleByCommodity: {},
        goodsBoughtWholesale: 0,
        markupEarned: 0,
        capacityValue: s.capacityValue,
      },
    ])
  );
  const transfers = new Map<string, StoreMarkupTransfer>();
  for (const [stateId, byCommodity] of routed) {
    const stores = storesByState.get(stateId) ?? [];
    const weights = stores.map((s) => ({ id: s.storeId, weight: s.capacityValue }));
    for (const [commodity, byWallet] of byCommodity) {
      for (const [wallet, wholesale] of byWallet) {
        const wholesaleShare = allocateByWeight(weights, wholesale);
        const markupShare = allocateByWeight(weights, storeMarkupOn(wholesale, input.markup));
        for (const store of stores) {
          const row = rows.get(store.storeId)!;
          const goods = wholesaleShare.get(store.storeId) ?? 0;
          const markup = markupShare.get(store.storeId) ?? 0;
          if (goods > 0) {
            row.wholesaleByCommodity[commodity] =
              (row.wholesaleByCommodity[commodity] ?? 0) + goods;
            row.goodsBoughtWholesale += goods;
          }
          if (markup > 0) {
            row.markupEarned += markup;
            const key = `${wallet}|${store.accountId}`;
            const transfer = transfers.get(key) ?? {
              fromAccountId: wallet,
              toAccountId: store.accountId,
              amount: 0,
            };
            transfer.amount += markup;
            transfers.set(key, transfer);
          }
        }
      }
    }
  }
  const sortKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    markup: input.markup,
    stores: [...rows.values()].sort((a, b) => sortKey(a.storeId, b.storeId)),
    channels: [...channels.values()].sort((a, b) =>
      sortKey(`${a.stateId}|${a.commodity}`, `${b.stateId}|${b.commodity}`)
    ),
    transfers: [...transfers.values()].sort((a, b) =>
      sortKey(`${a.fromAccountId}|${a.toAccountId}`, `${b.fromAccountId}|${b.toAccountId}`)
    ),
    coverageByState: input.coverageByState,
  };
}
