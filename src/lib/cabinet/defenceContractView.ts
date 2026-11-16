export interface DefenceContractView {
  /** "pending" until the supplying CEO accepts; only "active" delivers. */
  status?: string;
  _id: string;
  corporationId: string;
  sectorId: string;
  supplierName: string;
  component: string;
  lotsOrdered: number;
  lotsDelivered: number;
  pricePerLot: number;
  awardedTurn: number;
  /** Lots built and banked but not yet shipped, so a stalled order reads as stalled. */
  lotsBuiltNotDelivered?: number;
  /** Local currency paid so far, and what is still committed against the appropriation. */
  amountPaid?: number;
  encumberedAmount?: number;
  /** Why the last delivery turn banked output instead of shipping it, in plain text. */
  carryReasonText?: string;
  /** Grade this order is written for (0..3), and the lines the contractor assigned to it. */
  gradeCeiling?: number;
  assignedFactories?: number;
  totalFactories?: number;
  /** Public disclosure that the awarding minister had an interest in the supplier. */
  selfDealing?: { basis: "owner" | "shareholding"; stakeShare: number; ministerName?: string };
  /**
   * What tearing this contract up right now would cost, quoted BEFORE the minister confirms.
   *
   * A break fee the player only discovers from their appropriation afterwards is a trap, not
   * a rule. `terminationBasis` is why the number is what it is: a withdrawal or a supplier
   * who has stopped building costs nothing.
   */
  terminationFee?: number;
  terminationBasis?: "withdrawal" | "cause" | "convenience";
}
