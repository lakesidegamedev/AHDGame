/**
 * Options the versioned turn engine passes into `processCorporationTurn`.
 *
 * Absent (the v1 path) means every behaviour below is off, so the phase is
 * byte-for-byte the code that ran before the engine was versioned.
 */
export interface CorporationTurnOptions {
  /**
   * v2: batch the NPP relocation-bond credit fan and its inserts across the
   * whole decision cohort. Produces the same bonds, in the same order.
   */
  batchNppMarketEntryCredit?: boolean;
}
