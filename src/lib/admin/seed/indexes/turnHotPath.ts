import type { Db, IndexSpecification } from "mongodb";
import { ensureIndex } from "./helpers";

// Equality/range prefixes used by turn queries. Keep these in bootstrap and
// the existing-world installer so a reset cannot reintroduce collection scans.
const TURN_HOT_PATH_INDEXES: ReadonlyArray<{
  collection: string;
  key: IndexSpecification;
  name: string;
}> = [
  { collection: "corporationHistory", key: { turn: 1 }, name: "corporationHistory_turn" },
  { collection: "portfolioHistory", key: { characterId: 1 }, name: "portfolioHistory_characterId" },
  { collection: "bondHistory", key: { bondId: 1 }, name: "bondHistory_bondId" },
  // Serves the bond turn's per-bond prior-interest lookup as a DISTINCT_SCAN.
  {
    collection: "bondHistory",
    key: { bondId: 1, totalInterestPaid: -1 },
    name: "bondHistory_bondId_totalInterestPaid",
  },
  { collection: "shareOrders", key: { status: 1 }, name: "shareOrders_status" },
  // Serves the corporation turn's live-contract load and its expiry sweep.
  {
    collection: "supplyAgreements",
    key: { status: 1, expiresAtTurn: 1 },
    name: "supplyAgreements_status_expiresAtTurn",
  },
  {
    collection: "currencyOrders",
    key: { status: 1, expiryRefundState: 1 },
    name: "currencyOrders_expiry_refund",
  },
  // Market recovery stage 5 reads this turn's handover receipts by leg.
  {
    collection: "offTypeHandovers",
    key: { turn: 1, state: 1 },
    name: "offTypeHandovers_turn_state",
  },
  // The bond pool's working-balance probe sums live sovereign face maturing in
  // the next issuance interval. The leading matured flag keeps it on live paper
  // and the maturity range stays inside the index.
  {
    collection: "bonds",
    key: { matured: 1, maturityTurn: 1 },
    name: "bonds_matured_maturityTurn",
  },
  // The commodity phase reads one year of new debt issuance and the bond turn
  // reads this turn's at-par issues. Without this prefix both walk every bond
  // ever issued.
  { collection: "bonds", key: { issuedAtTurn: 1 }, name: "bonds_issuedAtTurn" },
];

export async function seedTurnHotPathIndexes(db: Db, log: (msg: string) => void) {
  for (const { collection, key, name } of TURN_HOT_PATH_INDEXES) {
    await ensureIndex(db, collection, key, { name }, log);
  }
}
