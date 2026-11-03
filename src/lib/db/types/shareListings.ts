import type { ObjectId } from "mongodb";
import type { ShareHoldingTerms } from "@/lib/corporations/rules/holdingTerms";

export interface ShareListing {
  activeShareFillKey?: string;
  lastShareFillKey?: string;
  /** Personal inventory held in escrow, including purchase ages and cost basis. */
  holdingTerms?: ShareHoldingTerms;
  _id: ObjectId;
  /** The corporation whose shares are being listed */
  corporationId: ObjectId;
  /** The character who created this listing */
  sellerCharacterId: ObjectId;
  /** Set when listing on behalf of a corporation */
  sellerCorporationId?: ObjectId;
  /** Original shares listed — does not change */
  sharesListed: number;
  /** Shares still available (decrements as offers are accepted) */
  sharesRemaining: number;
  /**
   * corp.sharePrice snapshot at creation time.
   * Sets the 50%–200% price bounds for incoming offers.
   */
  marketPriceAtCreation: number;
  status: "open" | "cancelled" | "filled";
  createdAt: Date;
  /** Last write; settlement stamps it, so a filled listing's completion time. */
  updatedAt?: Date;
  /** 24 turns after creation — turn processing expires when now >= expiresAt. */
  expiresAt: Date;
  /**
   * Turn-based mirror of `expiresAt` (createTurn + 24). Turn processing expires
   * the listing when `currentTurn >= expiresAtTurn`, so expiry freezes on pause
   * and doesn't drift with the game clock. Absent on legacy rows → Date fallback.
   */
  expiresAtTurn?: number;
  /**
   * Negotiated private sale: reserved for one named buyer at a price the two
   * players agreed, outside the 50%-200% offer band. The buyer pays and takes
   * every listed share in one step. Shown publicly on the company page.
   */
  negotiated?: NegotiatedSaleTerms;
}

export interface NegotiatedSaleTerms {
  buyerCharacterId: ObjectId;
  /** Agreed total in the listed corporation's liquid currency. */
  totalPrice: number;
  /** totalPrice / sharesListed, same currency. */
  pricePerShare: number;
}

export interface ShareOffer {
  acceptFillKey?: string;
  _id: ObjectId;
  listingId: ObjectId;
  /** Denormalized for bulk lookups during expiry */
  corporationId: ObjectId;
  /** The character making the offer */
  buyerCharacterId: ObjectId;
  /** Set when offering as a corporation */
  buyerCorporationId?: ObjectId;
  /** Total shares the buyer wants */
  shares: number;
  /**
   * Per-share offer price.
   * Must be between 50% and 200% of listing.marketPriceAtCreation.
   */
  pricePerShare: number;
  /** Total held in escrow: shares * pricePerShare */
  escrowAmount: number;
  status: "pending" | "accepted" | "expired" | "cancelled";
  createdAt: Date;
}
