/**
 * Funded demand by buyer kind: what each kind of non-company buyer ordered and
 * received in a settled funded market, per commodity.
 *
 * Company plants are left out because the commodity page already lists them
 * one by one. Units are scaled the same way as the funded supply and demand
 * rows (fundedLedgerRules), so the rows add up to the page's demand figure
 * together with company orders.
 *
 * Pure: settlement order outcomes in, rows out.
 */

/** Buyer kinds a funded order can come from, other than a company plant. */
export type FundedBuyerKind =
  "households" | "publicBuyer" | "investmentBuyer" | "backgroundEconomy" | "wideEconomy" | "other";

export interface FundedBuyerDemandRow {
  commodity: string;
  kind: FundedBuyerKind;
  /** Units ordered, on the price phase's unit basis. */
  requested: number;
  /** Units delivered, on the same basis. */
  delivered: number;
}

const WALLET_KINDS = new Set<FundedBuyerKind>([
  "households",
  "publicBuyer",
  "investmentBuyer",
  "backgroundEconomy",
  "wideEconomy",
]);

/**
 * The buyer kind of a funded account, or null for a company account (a
 * 24-character id). Wallet accounts are JSON scopes whose second entry is the
 * wallet kind.
 */
export function fundedBuyerKind(accountId: string): FundedBuyerKind | null {
  if (/^[a-f0-9]{24}$/i.test(accountId)) return null;
  try {
    const scope: unknown = JSON.parse(accountId);
    if (Array.isArray(scope) && WALLET_KINDS.has(scope[1] as FundedBuyerKind))
      return scope[1] as FundedBuyerKind;
  } catch {
    /* Not a wallet scope. */
  }
  return "other";
}

export function fundedBuyerDemandRows(
  outcomes: readonly {
    commodity: string;
    accountId: string;
    requestedUnits: number;
    deliveredUnits: number;
  }[],
  unitScale: number
): FundedBuyerDemandRow[] {
  if (!Number.isFinite(unitScale) || unitScale <= 0) throw new Error("Invalid unit scale");
  const rows = new Map<string, FundedBuyerDemandRow>();
  for (const o of outcomes) {
    const kind = fundedBuyerKind(o.accountId);
    if (kind == null) continue;
    const requested = Number.isFinite(o.requestedUnits) ? Math.max(0, o.requestedUnits) : 0;
    const delivered = Number.isFinite(o.deliveredUnits) ? Math.max(0, o.deliveredUnits) : 0;
    if (requested <= 0 && delivered <= 0) continue;
    const key = JSON.stringify([o.commodity, kind]);
    const row = rows.get(key) ?? { commodity: o.commodity, kind, requested: 0, delivered: 0 };
    row.requested += requested * unitScale;
    row.delivered += delivered * unitScale;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) =>
    a.commodity === b.commodity ? (a.kind < b.kind ? -1 : 1) : a.commodity < b.commodity ? -1 : 1
  );
}

/** Player-facing name and explanation of each buyer kind. */
export const FUNDED_BUYER_LABELS: Record<FundedBuyerKind, { name: string; description: string }> = {
  households: {
    name: "Households",
    description:
      "What households ordered with their wages and benefits last turn. Ordered units the market could not supply were not received.",
  },
  publicBuyer: {
    name: "Government procurement",
    description:
      "What governments ordered from their budgets last turn. Each country spends the share of its budget line that matches the share of its economy run by companies in the game. Ordered units the market could not supply were not received.",
  },
  investmentBuyer: {
    name: "Construction and investment",
    description:
      "What construction and investment buyers ordered last turn. Ordered units the market could not supply were not received.",
  },
  backgroundEconomy: {
    name: "Background economy (countries without companies)",
    description:
      "What economy-only countries, which trade from their national economy instead of company plants, ordered from this market last turn. Ordered units the market could not supply were not received.",
  },
  wideEconomy: {
    name: "Background economy (buyers)",
    description:
      "The rest of each state's economy, buying output that no other buyer took, never above the normal price. Its size is about a tenth of normal demand and grows with real economic growth. It only counts what it bought.",
  },
  other: {
    name: "Other buyers",
    description: "Orders from other market participants last turn.",
  },
};
