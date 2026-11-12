import type { ObjectId } from "mongodb";
import type { CurrencyCode } from "../../constants/currencies";

/**
 * Immutable audit trail for share movements on a corporation. Written by
 * recordShareTrade(); never mutated after insert.
 *
 * `kind`:
 *   - issuance: CEO issued new shares. `to` null = public issuance (into
 *       publicFloat); `to` set = CEO self-issuance (onto their shareholder
 *       entry, publicFloat unchanged).
 *   - market_buy / market_sell: traded with publicFloat at current sharePrice
 *   - limit_fill: a limit order filled
 *   - peer_fill: another player filled an open shareOrder
 *   - listing_fill: a private listing offer was accepted
 *   - takeover_buyout: hostile takeover forced minority sale
 *   - correction: admin/migration data fix (note required)
 *   - stock_split / reverse_split: CEO-driven split; structureChange populated
 */
export type ShareTradeKind =
  | "issuance"
  | "market_buy"
  | "market_sell"
  | "limit_fill"
  | "peer_fill"
  | "listing_fill"
  | "takeover_buyout"
  | "correction"
  | "stock_split"
  | "reverse_split";

/** One side of a trade. publicFloat is represented as `null` in the enclosing row. */
export interface ShareTradeParty {
  characterId?: ObjectId;
  imperialCharacterId?: ObjectId;
  corporationId?: ObjectId;
  /** Denormalized display name captured at trade time. */
  name: string;
}

/** One holder's position at a snapshot boundary (before / after a split). */
export interface ShareTradeStructureChangeHolder {
  kind: "character" | "imperial" | "corporation" | "fund" | "public_float";
  /** Absent for `public_float`. */
  ownerId?: string;
  /** Display name captured at snapshot time. "Public Float" for float. */
  name: string;
  shares: number;
  /** Fraction of totalShares at snapshot time, 0–1. Rounded to 6dp. */
  percent: number;
}

/** Before/after detail attached to stock_split and reverse_split rows. */
export interface ShareTradeStructureChangeMeta {
  oldTotalShares: number;
  newTotalShares: number;
  /** Share price in the corp's home currency, before the change. */
  oldSharePriceLocal: number;
  /** Share price in the corp's home currency, after the change. */
  newSharePriceLocal: number;
  oldPublicFloat: number;
  newPublicFloat: number;
  /** Triggering CEO character id (string). */
  triggeredByCharacterId?: string;
  before: ShareTradeStructureChangeHolder[];
  after: ShareTradeStructureChangeHolder[];
}

export interface ShareTradeHistory {
  _id: ObjectId;
  corporationId: ObjectId;
  kind: ShareTradeKind;
  /** Game turn at which the trade was recorded. */
  turn: number;
  /** Wall-clock insertion time. */
  createdAt: Date;
  shares: number;
  /** ₳-anchored price per share at trade time; zero for corporate actions. */
  pricePerShareAnchor: number;
  /** Total ₳-anchored notional; zero for corporate actions. */
  totalAnchor: number;
  /** Corp operating currency at trade time, for UI presentation. */
  corpCurrencyCode?: CurrencyCode;
  /** Recipient side; null when the public float is the recipient. */
  to: ShareTradeParty | null;
  /** Releasing side; null when the public float is the releaser. */
  from: ShareTradeParty | null;
  /** Free-text context (required for `correction`). */
  note?: string;
  /**
   * Populated when `kind` is `stock_split` or `reverse_split`; captures the full
   * shareholder register before and after the restructure so players (and the
   * Share History UI) can audit who moved what percent.
   */
  structureChange?: ShareTradeStructureChangeMeta;
}
