import { redenominateTransferredSavings } from "@/lib/savings/redenominateTransferredSavings";
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
 *   - Their old-currency savings ACCOUNTS close (the account record is the book of
 *     record for writes, so leaving it open would keep the old balance claimable
 *     next to the converted one), the opened flag and accrued interest follow the
 *     balance into the new currency, and the new-currency account is created.
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
import { closeCharacterSavings } from "@/lib/savings/closeCharacterSavings";
import { ensureSavingsAccount } from "@/lib/savings/accountsShell";
import { loadBankingPolicy } from "@/lib/banking/policy";
import { getCurrentTurn } from "@/lib/currentTurn";
import type { SavingsAccount } from "@/lib/db/types/savingsAccount";

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
  await redenominateTransferredSavings(db, regionId, oldCurrency, newCurrency, scale);

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

  // Old-currency savings accounts close BEFORE the wallet conversion: the
  // conversion below re-denominates the legacy fields, and an account left open
  // would keep its old-currency balance claimable alongside the converted one.
  // The legacy fields are left for the conversion (`keepLegacyProjection`).
  const residentFilter = {
    homeState: regionId,
    userId: { $ne: null },
    currencyBalances: { $type: "object" },
  } as unknown as Filter<Character>;
  const residents = await db
    .collection<Character>("characters")
    .find(residentFilter, { projection: { _id: 1 } })
    .toArray();
  const residentIds = residents.map((resident) => resident._id);
  if (residentIds.length > 0) {
    const openAccounts = await db
      .collection<SavingsAccount>("savingsAccounts")
      .find(
        {
          ownerType: "character",
          ownerId: { $in: residentIds },
          currency: oldCurrency,
          status: { $ne: "closed" },
        },
        { projection: { ownerId: 1 } }
      )
      .toArray();
    for (const ownerId of new Set(openAccounts.map((account) => account.ownerId.toString()))) {
      const owner = residentIds.find((id) => id.toString() === ownerId)!;
      await closeCharacterSavings(db, owner, {
        currency: oldCurrency,
        keepLegacyProjection: true,
      });
    }
  }

  // Resident players' home-currency wallet converts; other currencies stay as forex.
  // One pipeline update computed from each document's live balances: players act
  // while the turn runs, so a wallet read earlier and written back whole would
  // erase any spend, trade or credit that landed in between.
  await db.collection<Character>("characters").updateMany(residentFilter, [
    {
      $set: {
        "currencyBalances.campaign": {
          $multiply: [{ $ifNull: ["$currencyBalances.campaign", 0] }, scale],
        },
        "currencyBalances.personal": convertWalletExpr("personal", oldCurrency, newCurrency, scale),
        "currencyBalances.savings": convertWalletExpr("savings", oldCurrency, newCurrency, scale),
        // Accrued and lifetime interest belong to the savings balance, so
        // they cross with it; the new account is built from these fields.
        "currencyBalances.pendingSavingsInterest": convertWalletExpr(
          "pendingSavingsInterest",
          oldCurrency,
          newCurrency,
          scale
        ),
        "currencyBalances.interestEarned": convertWalletExpr(
          "interestEarned",
          oldCurrency,
          newCurrency,
          scale
        ),
        // Savings the player had opened stay opened in the new currency.
        savingsAccountsOpened: {
          $mergeObjects: [
            { $ifNull: ["$savingsAccountsOpened", {}] },
            {
              $cond: [
                { $eq: [`$savingsAccountsOpened.${oldCurrency}`, true] },
                { [newCurrency]: true },
                {},
              ],
            },
          ],
        },
        updatedAt: now,
      },
    },
  ]);

  // Build the new-currency account for every resident who now holds savings in
  // it, so the bank page and the savings commands find a record instead of
  // asking the player to open one.
  const policy = await loadBankingPolicy(db);
  if (policy.savingsAccounts === "authoritative") {
    const holders = await db
      .collection<Character>("characters")
      .find(
        {
          ...residentFilter,
          [`currencyBalances.savings.${newCurrency}`]: { $gt: 0 },
        } as unknown as Filter<Character>,
        { projection: { _id: 1 } }
      )
      .toArray();
    const turn = await getCurrentTurn(db);
    for (const holder of holders) {
      const account = await ensureSavingsAccount(db, holder._id, newCurrency, turn);
      if (!account) throw new Error("Savings account could not be created after currency change.");
    }
  }
}

/**
 * Aggregation expression for one wallet bucket: the old-currency balance moves
 * to the new currency at `scale` and its key is dropped; every other currency is
 * kept as a forex position. A bucket with no old-currency balance is unchanged.
 */
export function convertWalletExpr(
  bucket: "personal" | "savings" | "pendingSavingsInterest" | "interestEarned",
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
