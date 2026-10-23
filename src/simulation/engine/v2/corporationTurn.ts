import { processCorporationTurn } from "@/lib/turn/corporation";

/**
 * v2 `corporationTurn`.
 *
 * Same phase, same rules, same writes. The only change is where the NPP
 * relocation-bond credit fan reads from: v1 resolves it per corporation
 * (bonds, sectors, corporationHistory, gameConfig, gameState — ~8 round trips
 * for every corp that asks for credit, ~1.1k of them on the production world),
 * v2 preloads the same inputs once for the cohort and inserts the planned
 * bonds in one ordered `insertMany`.
 *
 * The decision math is a line-for-line mirror of `previewRelocationBond` and
 * `issueRelocationBond`, kept separate on purpose so the parity bench compares
 * v1's untouched code against it. See `relocationCreditBatch.ts`.
 */
export function processCorporationTurnV2(turn?: number) {
  return processCorporationTurn(turn, { batchNppMarketEntryCredit: true });
}
