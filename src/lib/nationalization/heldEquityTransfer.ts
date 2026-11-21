import { transferFinancialHoldings } from "./transferFinancialHoldings";
/**
 * Nationalization preserves the seized corporation's holdings in other corporations.
 * heldStakeValueAnchor values the holdings; transferOwnedSharesToNatCorp moves
 * their shares to the National Corporation without a second cash payout.
 */
import type { Db, ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { corpLiquidCapitalToAnchor } from "@/lib/currency/corporationCapital";

/** One corporation the seized corporation holds shares in, as read for the taking. */
type HeldStake = Pick<
  Corporation,
  "_id" | "shareholders" | "sharePrice" | "liquidCurrencyCode" | "countryId"
>;

/** Market value, in ₳, of the shares the seized corporation holds in other corporations. */
export function heldStakeValueAnchor(
  stakes: HeldStake[],
  seizedCorpId: ObjectId,
  fxByCurrency: ReadonlyMap<CurrencyCode, number>
): number {
  let total = 0;
  for (const stake of stakes) {
    const shares =
      stake.shareholders?.find((sh) => sh.corporationId?.equals(seizedCorpId))?.shares ?? 0;
    if (!(shares > 0)) continue;
    total += corpLiquidCapitalToAnchor(
      shares * (stake.sharePrice ?? 0),
      stake,
      fxByCurrency.get(stake.liquidCurrencyCode as CurrencyCode) ?? 1
    );
  }
  return total;
}

/**
 * Transfer shares owned by the seized corporation in other corporations to the
 * National Corporation. When a corporation owns shares in other corporations,
 * those shares must be transferred rather than silently destroyed during
 * dissolution. They move as shares only: the buyout already paid
 * the seized corporation's holders their market value, so crediting
 * that value again as cash would create money.
 */
export async function transferOwnedSharesToNatCorp(
  db: Db,
  seizedCorp: Corporation,
  nationalCorpId: ObjectId,
  _heldStakes: HeldStake[],
  now: Date
): Promise<void> {
  await transferFinancialHoldings(db, seizedCorp._id, nationalCorpId, now);
}
