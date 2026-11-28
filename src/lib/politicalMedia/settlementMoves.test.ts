import { describe, expect, it } from "vitest";
import { settlementMove, type PoliticalMediaOrderIdentity } from "./settlementMoves";

const rate = 0.9746147219267948;
const requestedAnchor = 373.1247715638355;
const first = 149.2499086255342;
const second = 223.8748629383013;

const identity: PoliticalMediaOrderIdentity = {
  orderId: "campaign-media-order",
  source: "campaign_maintenance",
  createdTurn: 194,
  countryId: "US",
  targetStateId: "FL",
  requestedAnchor,
  payer: {
    collection: "campaigns",
    documentId: "6b0458ad1bb36757e995fce9",
    documentIdIsObjectId: true,
    path: "funds",
    currencyCode: "USD",
    localPerAnchor: 1.37848,
    amountLocal: requestedAnchor * 1.37848,
    actionCost: 0,
    currentActions: null,
  },
  details: {},
};

const sellerReceipt = (corporationId: string, amountAnchor: number) => ({
  allocationId: `${corporationId}-sector`,
  sectorId: `${corporationId}-sector`,
  corporationId,
  units: amountAnchor / 12.5,
  amountAnchor,
  sellerLocalAmount: amountAnchor * rate,
  sellerCurrencyCode: "USD",
  sellerLocalPerAnchor: rate,
});

describe("settlementMove", () => {
  it("never debits more escrow than the order funded when credits round back up", () => {
    const credited = (first * rate) / rate + (second * rate) / rate;
    // The fixture reproduces the rounding that refused a live settlement.
    expect(credited).toBeGreaterThan(requestedAnchor);

    const built = settlementMove(
      {
        orderId: identity.orderId,
        identity,
        settlementPlan: {
          plannedTurn: 195,
          deliveredAnchor: requestedAnchor,
          unfilledAnchor: 0,
          deliveredUnits: requestedAnchor / 12.5,
          sellers: [
            sellerReceipt("6afb8d03f2d559ce85b3c2c5", first),
            sellerReceipt("6b00b59f66150819b61113c5", second),
          ],
        },
      },
      195,
      new Set()
    );

    const [debit] = built.move.legs;
    expect(debit.kind).toBe("debit");
    expect(debit.amount).toBeLessThanOrEqual(requestedAnchor);
    expect(debit.amount).toBe(requestedAnchor);
  });
});
