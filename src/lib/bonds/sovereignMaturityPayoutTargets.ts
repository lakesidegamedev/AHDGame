/**
 * Payout targets for a funded sovereign maturity. A frozen holder quote can
 * name payees that no longer resolve at payout time; this module maps each
 * frozen leg to a target that exists, so the escrowed cash always lands.
 */
import type { Collection, Db } from "mongodb";
import { getBankId } from "@/lib/centralBank/helpers";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { frozenPoolCashPerFace } from "@/lib/budget/rules/fiscalScale";

export interface SovereignMaturityCashLeg {
  collection: string;
  filter: Record<string, unknown>;
  path: string;
  amount: number;
  currencyCode: CurrencyCode;
  localPerAnchor: number;
  note: string;
}

/**
 * Pool cash per unit of book face a frozen maturity claim was quoted at: below
 * 1 only when the claim froze under the fiscal scale split. Novation and a
 * forced rollover net pool units off the pool leg at this rate, never at face.
 */
export function frozenClaimPoolCashPerFace(claim: {
  currencyCode: string;
  sourcePublicFloat: number;
  holderLegs: ReadonlyArray<Pick<SovereignMaturityCashLeg, "collection" | "filter" | "amount">>;
}): number {
  const leg = claim.holderLegs.find(
    (row) => row.collection === "bondMarketPools" && String(row.filter._id) === claim.currencyCode
  );
  return frozenPoolCashPerFace(
    leg?.amount ?? 0,
    Math.max(0, claim.sourcePublicFloat) * BOND_UNIT_FACE_VALUE
  );
}

/**
 * The centralBanks document that holds a country's central-bank sovereign
 * units. Shared and currency-union banks own one document under their own id
 * (DE resolves to "ECB", SCO and WAL to "UK"), so a raw country id names no
 * document and the reserve credit could never land. Same resolver the
 * Treasury reserve transfer uses for the same reserveBalance field.
 */
export function sovereignMaturityCentralBankId(countryOrBankId: string): string {
  return getBankId(countryOrBankId as CountryId);
}

/** Holder collections whose payee can leave the game while its units stay on the bond. */
const SOVEREIGN_MATURITY_HOLDER_COLLECTIONS = new Set([
  "characters",
  "imperialCharacters",
  "corporations",
  "indexFunds",
  "npps",
]);

/**
 * Where a matured holder lot goes when its holder document no longer exists.
 *
 * Default (the existing release-to-float convention, see
 * releaseCharacterHeldBondsToFloat): a departed holder's units belong to the
 * public float, and matured float redeems to the bond's funded market pool.
 * The anchor value of the original leg is preserved exactly, so the payout
 * still nets to zero against its escrow debit. The amount is re-expressed in
 * the pool's local currency at the frozen Treasury valuation.
 */
export function redirectUnclaimableSovereignMaturityLeg(
  leg: SovereignMaturityCashLeg,
  pool: { currencyCode: CurrencyCode; localPerAnchor: number }
): SovereignMaturityCashLeg {
  return {
    collection: "bondMarketPools",
    filter: { _id: pool.currencyCode },
    path: "cashLocal",
    amount: (leg.amount / leg.localPerAnchor) * pool.localPerAnchor,
    currencyCode: pool.currencyCode,
    localPerAnchor: pool.localPerAnchor,
    note: "Redeem unclaimable sovereign maturity (holder no longer exists) to its funded pool",
  };
}

/** Live payee ids already resolved for a whole maturity wave, keyed `${collection}:${id}`. */
export interface SovereignMaturityLiveTargets {
  live: ReadonlySet<string>;
  /** Collections the preload read in full; anything else is still queried per settlement. */
  collections: ReadonlySet<string>;
}

/**
 * Resolve every payee named by a maturity wave in one read per collection. The
 * per-bond resolver asks once per holder kind for every maturing bond, which is
 * the read that repeats hundreds of times on a ladder maturity turn.
 */
export async function loadSovereignMaturityLiveTargets(
  db: Db,
  legGroups: Iterable<readonly SovereignMaturityCashLeg[]>
): Promise<SovereignMaturityLiveTargets> {
  const idsByCollection = new Map<string, unknown[]>();
  for (const legs of legGroups) {
    for (const leg of legs) {
      if (!SOVEREIGN_MATURITY_HOLDER_COLLECTIONS.has(leg.collection) || !(leg.amount > 0)) continue;
      const ids = idsByCollection.get(leg.collection) ?? [];
      ids.push(leg.filter._id);
      idsByCollection.set(leg.collection, ids);
    }
  }
  const live = new Set<string>();
  const collections = new Set<string>();
  const readCollection = async (name: string) => {
    const ids = idsByCollection.get(name);
    if (!ids?.length) return;
    collections.add(name);
    const rows = await db
      .collection<{ _id: unknown }>(name)
      .find({ _id: { $in: ids } } as never, { projection: { _id: 1 } })
      .toArray();
    for (const row of rows) live.add(`${name}:${String(row._id)}`);
  };
  await Promise.all([
    readCollection("characters"),
    readCollection("imperialCharacters"),
    readCollection("corporations"),
    readCollection("indexFunds"),
    readCollection("npps"),
  ]);
  return { live, collections };
}

/**
 * Resolve frozen holder legs to targets that exist at payout time. A frozen
 * quote can outlive its payees (an NPP culled by a party merge) and can carry
 * a raw country id for a shared central bank. Either leaves a credit leg that
 * can never apply, which strands the escrowed cash. Pure for live targets:
 * only missing holder documents and shared-bank ids change.
 */
export async function resolveSovereignMaturityPayoutLegs(
  db: Db,
  legs: readonly SovereignMaturityCashLeg[],
  pool: { currencyCode: CurrencyCode; localPerAnchor: number },
  preloaded?: SovereignMaturityLiveTargets
): Promise<SovereignMaturityCashLeg[]> {
  const idsByCollection = new Map<string, unknown[]>();
  for (const leg of legs) {
    if (!SOVEREIGN_MATURITY_HOLDER_COLLECTIONS.has(leg.collection) || !(leg.amount > 0)) continue;
    const ids = idsByCollection.get(leg.collection) ?? [];
    ids.push(leg.filter._id);
    idsByCollection.set(leg.collection, ids);
  }
  // One bounded $in read per holder kind (at most five), never one per leg.
  const liveIds = async (name: string, collection: Collection<{ _id: unknown }>) => {
    const ids = idsByCollection.get(name);
    if (!ids?.length) return [];
    if (preloaded?.collections.has(name)) return [];
    const rows = await collection
      .find({ _id: { $in: ids } } as never, { projection: { _id: 1 } })
      .toArray();
    return rows.map((row) => `${name}:${String(row._id)}`);
  };
  const live = new Set<string>(preloaded?.live ?? []);
  for (const id of (
    await Promise.all([
      liveIds("characters", db.collection<{ _id: unknown }>("characters")),
      liveIds("imperialCharacters", db.collection<{ _id: unknown }>("imperialCharacters")),
      liveIds("corporations", db.collection<{ _id: unknown }>("corporations")),
      liveIds("indexFunds", db.collection<{ _id: unknown }>("indexFunds")),
      liveIds("npps", db.collection<{ _id: unknown }>("npps")),
    ])
  ).flat())
    live.add(id);
  return legs.map((leg) => {
    if (leg.collection === "centralBanks") {
      const bankId = sovereignMaturityCentralBankId(String(leg.filter._id));
      return bankId === leg.filter._id ? leg : { ...leg, filter: { ...leg.filter, _id: bankId } };
    }
    if (
      SOVEREIGN_MATURITY_HOLDER_COLLECTIONS.has(leg.collection) &&
      leg.amount > 0 &&
      !live.has(`${leg.collection}:${String(leg.filter._id)}`)
    )
      return redirectUnclaimableSovereignMaturityLeg(leg, pool);
    return leg;
  });
}
