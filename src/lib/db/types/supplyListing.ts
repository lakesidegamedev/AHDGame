import type { ObjectId } from "mongodb";
import type { CommodityType } from "@/lib/constants/commodities";
/**
 * How a computer-run listing's quantity was sized: a share of the seller's
 * spare contractable capacity, or the seller's total unmet output (one figure
 * shared by every input it buys).
 */
export type SupplyListingSizingBasis = "spareCapacity" | "unmetOutput";
/**
 * Standing offer. Posting is the publisher's consent: a taker who passes the
 * contract guards forms an active agreement for any volume up to what is left.
 */
export interface SupplyListing {
  /** Publisher id and slot make the ten-listing limit atomic. */
  _id: string;
  corporationId: ObjectId;
  /** Absent on AI-posted listings (`aiListed`). */
  publishedByUserId?: string;
  /** Standing offer posted by an AI-run corporation from spare capacity or unmet input demand. */
  aiListed?: true;
  slot: number;
  side: "buy" | "sell";
  commodity: CommodityType;
  stateId?: string;
  volumeCap: number;
  pricePremium: number;
  /** Set on AI-posted listings. */
  sizingBasis?: SupplyListingSizingBasis;
  durationTurns?: number;
  expiresAtTurn: number;
  updatedAt: Date;
}
export interface SupplyListingView {
  id: string;
  corporationId: string;
  corporationName: string;
  /** Publisher's home country, the seller's for a sell offer. */
  corporationCountryId?: string;
  /** Publisher's credit rating, when one has been assigned. */
  creditRating?: string;
  slot: number;
  own: boolean;
  /** Posted by an NPP-run corporation rather than a player. */
  ai?: boolean;
  /** Publisher's corporation logo, when one was uploaded. */
  corporationLogoUrl?: string;
  /** Player CEO of the publisher, absent for NPP corporations. */
  ceoName?: string;
  ceoAvatarUrl?: string;
  side: "buy" | "sell";
  commodity: CommodityType;
  stateId?: string;
  volumeCap: number;
  pricePremium: number;
  /** What a computer-run offer's quantity is sized from; absent on player offers. */
  sizingBasis?: SupplyListingSizingBasis;
  durationTurns?: number;
  expiresAtTurn: number;
  /** Why the viewing corporation's plants could never receive this offer, when they could not. */
  unreachableReason?: string;
}
