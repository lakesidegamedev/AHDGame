import type { CurrencyCode } from "@/lib/constants/currencies";
import type { FundedSovereignCouponClaim } from "@/lib/db/types/budget";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { perTurnCouponPayment } from "@/lib/constants/bonds";

export interface SovereignCouponCorporationQuote {
  id: string;
  countryId: string;
  currencyCode: CurrencyCode;
  localPerAnchor: number;
  currencyFieldPresent: boolean;
  currencyFieldValue?: string | null;
  currencyUsesCountryFallback: boolean;
}

export interface SovereignCouponBondSnapshot {
  id: string;
  countryId?: string;
  currencyCode?: CurrencyCode;
  couponRate: number;
  publicFloat: number;
  holders: Array<{
    kind: "character" | "imperial" | "corporation" | "fund" | "npp" | "bank";
    id?: string;
    units: number;
  }>;
}

/** Pure holder snapshot calculation. Database ids and mutable docs stay in the shell. */
export function freezeSovereignCouponClaim(input: {
  bond: SovereignCouponBondSnapshot;
  turn: number;
  anchorRate: number;
  forexEnabled: boolean;
  corporateQuotes: ReadonlyMap<string, SovereignCouponCorporationQuote>;
}): FundedSovereignCouponClaim | null {
  const { bond, turn, anchorRate, forexEnabled, corporateQuotes } = input;
  const currencyCode = bond.currencyCode ?? "USD";
  const perUnit = perTurnCouponPayment(bond.couponRate, BOND_UNIT_FACE_VALUE);
  const amount = (units: number) => perUnit * Math.max(0, units);
  const holders: FundedSovereignCouponClaim["holders"] = [];
  if (bond.publicFloat > 0) {
    const amountLocal = amount(bond.publicFloat);
    holders.push({
      kind: "publicFloat",
      amountLocal,
      amountAnchor: amountLocal / anchorRate,
      currencyCode,
    });
  }
  for (const holder of bond.holders ?? []) {
    if (holder.kind === "bank" || holder.units <= 0) continue;
    const amountLocal = amount(holder.units);
    const base = { amountLocal, amountAnchor: amountLocal / anchorRate };
    const id = holder.id;
    if (!id) continue;
    if (holder.kind === "corporation") {
      const quote = corporateQuotes.get(id);
      if (!quote) throw new Error(`Missing corporate FX quote for sovereign coupon ${bond.id}`);
      holders.push({
        ...base,
        kind: "corporation",
        id,
        currencyCode,
        payeeCurrencyCode: quote.currencyCode,
        payeeLocalPerAnchor: quote.localPerAnchor,
        payeeCountryId: quote.countryId,
        payeeCurrencyFieldPresent: quote.currencyFieldPresent,
        payeeCurrencyFieldValue: quote.currencyFieldValue,
        payeeCurrencyUsesCountryFallback: quote.currencyUsesCountryFallback,
      });
    } else if (holder.kind === "character" || holder.kind === "imperial") {
      holders.push({
        ...base,
        kind: holder.kind,
        id,
        currencyCode,
        personalBalancePath: forexEnabled
          ? `currencyBalances.personal.${currencyCode}`
          : "cashOnHand",
      });
    } else if (holder.kind === "fund") holders.push({ ...base, kind: "fund", id });
    else if (holder.kind === "npp") holders.push({ ...base, kind: "npp", id });
  }
  const amountLocal = holders.reduce((sum, row) => sum + row.amountLocal, 0);
  if (!(amountLocal > 0)) return null;
  return {
    id: `sovereign-coupon:${bond.id}:${turn}`,
    bondId: bond.id,
    dueTurn: turn,
    countryId: String(bond.countryId ?? ""),
    currencyCode,
    amountLocal,
    anchorRate,
    holders,
  };
}

/**
 * Which grouped claim a coupon holder's leg joins. Players hold real money and
 * settle first under the fiscal scale's debt service split, so their legs
 * stay apart from the bond pool, index funds and NPPs.
 */
export type SovereignCouponPayeeGroup = "player" | "market";

const PLAYER_PAYEE_KINDS: ReadonlySet<string> = new Set(["character", "imperial", "corporation"]);

export function sovereignCouponPayeeGroup(
  kind: FundedSovereignCouponClaim["holders"][number]["kind"]
): SovereignCouponPayeeGroup {
  return PLAYER_PAYEE_KINDS.has(kind) ? "player" : "market";
}

/**
 * Stands in for the bond id of a grouped claim, so a grouped claim id has the
 * same `sovereign-coupon:<token>:<dueTurn>` shape as a per-bond one. Budget ids
 * and currency codes never contain `~` or `:`.
 */
export function sovereignCouponGroupToken(
  budgetId: string,
  currencyCode: string,
  group: SovereignCouponPayeeGroup
): string {
  return `grp~${budgetId}~${currencyCode}~${group}`;
}

/** Prefix every grouped token of one budget starts with. */
export const sovereignCouponGroupTokenPrefix = (budgetId: string) => `grp~${budgetId}~`;

/** A holder leg is the same payee, under the same frozen quote, when every field but the amounts match. */
function payeeKey(holder: FundedSovereignCouponClaim["holders"][number]): string {
  return JSON.stringify([
    holder.kind,
    holder.id ?? null,
    holder.currencyCode ?? null,
    holder.payeeCurrencyCode ?? null,
    holder.payeeLocalPerAnchor ?? null,
    holder.payeeCountryId ?? null,
    holder.payeeCurrencyFieldPresent ?? null,
    holder.payeeCurrencyFieldValue === undefined ? "u" : holder.payeeCurrencyFieldValue,
    holder.payeeCurrencyUsesCountryFallback ?? null,
    holder.personalBalancePath ?? null,
  ]);
}

/** One grouped claim and the per-bond claims folded into it. */
export interface GroupedSovereignCouponClaim {
  claim: FundedSovereignCouponClaim;
  group: SovereignCouponPayeeGroup;
  /** Bonds whose legs it carries, in fold order. */
  bondIds: string[];
}

/**
 * Fold per-bond coupon claims into one claim per due turn, currency, frozen
 * native quote and payee group. Each payee's legs are summed in input order,
 * so a payee is owed exactly what its per-bond legs added up to and the claim
 * amount is the sum of its legs, as a frozen claim's always is.
 *
 * `idSuffix` is appended to every grouped id (the one-time heal names its
 * claims apart from the accrual's).
 */
export function groupSovereignCouponClaims(
  budgetId: string,
  claims: readonly FundedSovereignCouponClaim[],
  idSuffix = ""
): GroupedSovereignCouponClaim[] {
  const out = new Map<
    string,
    GroupedSovereignCouponClaim & {
      legs: Map<string, FundedSovereignCouponClaim["holders"][number]>;
      bondSet: Set<string>;
    }
  >();
  for (const source of claims) {
    for (const holder of source.holders) {
      const group = sovereignCouponPayeeGroup(holder.kind);
      const key = JSON.stringify([source.dueTurn, source.currencyCode, source.anchorRate, group]);
      let row = out.get(key);
      if (!row) {
        const token = sovereignCouponGroupToken(budgetId, source.currencyCode, group);
        row = {
          claim: {
            id: `sovereign-coupon:${token}:${source.dueTurn}${idSuffix}`,
            bondId: token,
            dueTurn: source.dueTurn,
            countryId: source.countryId,
            currencyCode: source.currencyCode,
            amountLocal: 0,
            anchorRate: source.anchorRate,
            holders: [],
          },
          group,
          bondIds: [],
          legs: new Map(),
          bondSet: new Set(),
        };
        out.set(key, row);
      }
      if (!row.bondSet.has(source.bondId)) {
        row.bondSet.add(source.bondId);
        row.bondIds.push(source.bondId);
      }
      const leg = payeeKey(holder);
      const merged = row.legs.get(leg);
      if (merged) {
        merged.amountLocal += holder.amountLocal;
        merged.amountAnchor += holder.amountAnchor;
      } else {
        const copy = { ...holder };
        row.legs.set(leg, copy);
        row.claim.holders.push(copy);
      }
    }
  }
  return [...out.values()].map(({ claim, group, bondIds }) => ({
    claim: { ...claim, amountLocal: claim.holders.reduce((sum, row) => sum + row.amountLocal, 0) },
    group,
    bondIds,
  }));
}
