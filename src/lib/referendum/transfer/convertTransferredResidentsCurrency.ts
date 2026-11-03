/**
 * Re-denominate a transferred region's money into its new country's currency.
 * When NI joins Ireland its residents' sterling becomes Irish pounds (an involuntary
 * currency-union change — unlike a voluntary HQ relocation, which leaves personal
 * forex holdings alone):
 *
 *   - Corporations that followed the region in re-denominate via the shared
 *     `convertCorpCurrency` (liquid capital, sector revenues, share price, …).
 *   - Resident players' home-currency wallet balances (campaign + the old-currency
 *     personal/savings buckets) convert at the live FX scale; foreign-currency
 *     holdings they already kept are left as forex positions.
 *
 * No-op when forex is disabled, the two countries share a currency, or a rate is
 * missing (refuse rather than persist order-of-magnitude-wrong balances).
 */
import { retainsCompletedSecuredCurrency } from "./rules/securedCurrency";
import type { CorporateSector } from "@/lib/db/types/corporation";
import type { Db, Filter } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { Corporation, Character } from "@/lib/db/types";
import { type CurrencyCode } from "@/lib/constants/currencies";
import { type FxScalePair, loadFxScalePair } from "@/lib/country/mergeFxScale";
import { convertCorpCurrency } from "@/lib/corporations/convertCorpCurrency";

export async function convertTransferredResidentsCurrency(
  db: Db,
  regionId: string,
  fromCountryId: CountryId,
  toCountryId: CountryId,
  strict = false,
  frozenPair?: FxScalePair
): Promise<void> {
  // The SHARED merge rate source (`loadFxScalePair`), so every pot of money
  // that crosses in one merge crosses at one price. This caller's missing-rate
  // policy is REFUSE (the region already moved; balances can be re-converted
  // later) — unlike the national merge, which fails open at 1.
  const pair = frozenPair ?? (await loadFxScalePair(db, fromCountryId, toCountryId));
  if (pair.kind === "missing-rate" && strict)
    throw new Error("Currency conversion requires usable exchange rates.");
  if (pair.kind !== "convert") return;
  const { scale, oldCurrency, newCurrency, fxByCurrency } = pair;
  const now = new Date();

  // Corps that followed the region into the new country re-denominate to its
  // currency (NPP-relocated corps that stayed in the source country are excluded
  // — their HQ is no longer in this region).
  const corps = await db
    .collection<Corporation>("corporations")
    .find({ headquartersState: regionId, countryId: toCountryId })
    .toArray();
  const securedSectors = strict
    ? await db
        .collection<CorporateSector>("corporateSectors")
        .find(
          { corporationId: { $in: corps.map((corp) => corp._id) } },
          {
            projection: {
              corporationId: 1,
              constructionFinancing: 1,
              constructionPropertyTransition: 1,
              buildQueue: 1,
            },
          }
        )
        .toArray()
    : [];
  for (const corp of corps) {
    // Country ownership changes, but a fully built pledged plant and its debt are not cancelled.
    // Keeping the native corporate ledger preserves the lender's original currency and security.
    if (
      strict &&
      retainsCompletedSecuredCurrency(
        securedSectors.filter((sector) => String(sector.corporationId) === String(corp._id))
      )
    )
      continue;
    // Forex is enabled by construction here — a "convert" pair only exists
    // with the feature on.
    const result = await convertCorpCurrency(db, corp, newCurrency, fxByCurrency, now, true);
    if (strict && result && !result.ok) throw new Error(result.error);
  }

  // Region party organisations that CARRIED with a dissolving source (the
  // evacuate path deletes them, so this matches nothing on a referendum
  // transfer) hold their treasuries in the old currency. One multiplicative
  // pass per region: the region moves exactly once, so this cannot re-run.
  await db
    .collection("statePartyOrg")
    .updateMany({ stateId: regionId }, { $mul: { treasury: scale }, $set: { updatedAt: now } });

  // Resident players' home-currency wallet converts; other currencies stay as forex.
  // One pipeline update computed from each document's live balances: players act
  // while the turn runs, so a wallet read earlier and written back whole would
  // erase any spend, trade or credit that landed in between.
  await db.collection<Character>("characters").updateMany(
    {
      homeState: regionId,
      userId: { $ne: null },
      currencyBalances: { $type: "object" },
    } as unknown as Filter<Character>,
    [
      {
        $set: {
          "currencyBalances.campaign": {
            $multiply: [{ $ifNull: ["$currencyBalances.campaign", 0] }, scale],
          },
          "currencyBalances.personal": convertWalletExpr(
            "personal",
            oldCurrency,
            newCurrency,
            scale
          ),
          "currencyBalances.savings": convertWalletExpr("savings", oldCurrency, newCurrency, scale),
          updatedAt: now,
        },
      },
    ]
  );
}

/**
 * Aggregation expression for one wallet bucket: the old-currency balance moves
 * to the new currency at `scale` and its key is dropped; every other currency is
 * kept as a forex position. A bucket with no old-currency balance is unchanged.
 */
export function convertWalletExpr(
  bucket: "personal" | "savings",
  oldCurrency: CurrencyCode,
  newCurrency: CurrencyCode,
  scale: number
): Record<string, unknown> {
  const wallet = { $ifNull: [`$currencyBalances.${bucket}`, {}] };
  const oldBalance = { $ifNull: [`$currencyBalances.${bucket}.${oldCurrency}`, 0] };
  const newBalance = { $ifNull: [`$currencyBalances.${bucket}.${newCurrency}`, 0] };
  return {
    $cond: [
      { $ne: [oldBalance, 0] },
      {
        $mergeObjects: [
          {
            $arrayToObject: {
              $filter: {
                input: { $objectToArray: wallet },
                cond: { $ne: ["$$this.k", oldCurrency] },
              },
            },
          },
          { [newCurrency]: { $add: [newBalance, { $multiply: [oldBalance, scale] }] } },
        ],
      },
      wallet,
    ],
  };
}
