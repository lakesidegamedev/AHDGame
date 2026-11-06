/**
 * Fields written when the OWNER reactivates a mothballed sector by hand. The
 * loss and zero-sales counters restart from zero and the marker tells autopilot
 * to leave the sector running for MANUAL_RESTART_GRACE_TURNS.
 */
export function ownerRestartFields(turn: number): {
  pnlLossTurns: 0;
  producerZeroSalesTurns: 0;
  manualReactivatedTurn: number;
} {
  return { pnlLossTurns: 0, producerZeroSalesTurns: 0, manualReactivatedTurn: turn };
}
