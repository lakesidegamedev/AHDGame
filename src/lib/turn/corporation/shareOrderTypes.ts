import { ObjectId } from "mongodb";
import { type ShareHoldingTerms } from "@/lib/corporations/rules/holdingTerms";

import { type CurrencyCode } from "@/lib/constants/currencies";

export /** Per-character delta for a corp, plus the fill price for new-entry cost basis. */
interface ShareDelta {
  holdingTerms?: ShareHoldingTerms;
  delta: number;
  /**
   * Per-share fill price (₳). Set when this delta *increases* a holding (buy fill)
   * so we can stamp `avgCostPerShare` on a brand-new pushed entry and match the
   * convention used by the direct-buy route. Not tracked for sells (decrement only).
   */
  pricePerShare?: number;
}

export /**
 * One queued trade-history emission collected during fill resolution.
 * Names are resolved in a batch lookup after all fills are applied.
 */
interface PendingHistoryEmit {
  taxCreditId?: string;
  sellerHoldingTerms?: ShareHoldingTerms;
  corporationId: ObjectId;
  kind: "limit_fill";
  shares: number;
  pricePerShareAnchor: number;
  corpCurrencyCode?: CurrencyCode;
  /** Populated with a resolved name before insert. */
  fromPartyRef?: { characterId?: ObjectId; corporationId?: ObjectId };
  toPartyRef?: { characterId?: ObjectId; corporationId?: ObjectId };
}
