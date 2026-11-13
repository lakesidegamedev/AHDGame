import { expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { settleTransition } from "./settlementJournal";
import { oid, type BankingTransition } from "./rules/boundary";
import { witnessConstructionContribution } from "./constructionCashWitness";

it.each([100, 1_000])("witnesses a guarded contribution once, opening cash %s", async (cash) => {
  const memory = createInMemoryDb(),
    borrower = new ObjectId(),
    sector = new ObjectId();
  memory.seed("corporations", [{ _id: borrower, liquidCapital: cash }]);
  memory.seed("corporateSectors", [{ _id: sector, escrowLocal: 0 }]);
  const transition: BankingTransition = {
    key: "construction:cash-witness:contribution",
    kind: "construction_contribution",
    turn: 8,
    currency: "CAD",
    legs: [
      {
        kind: "debit",
        collection: "corporations",
        filter: { _id: oid(borrower.toHexString()), liquidCapital: { $gte: 125 } },
        path: "liquidCapital",
        amount: 125,
        note: "Contribution",
      },
      {
        kind: "credit",
        collection: "corporateSectors",
        filter: { _id: oid(sector.toHexString()) },
        path: "escrowLocal",
        amount: 125,
        note: "Escrow",
      },
    ],
    projections: [
      {
        collection: "corporateSectors",
        filter: { _id: oid(sector.toHexString()) },
        update: { $set: { contributionPaid: true } },
        note: "Publish the contribution",
      },
    ],
    event: { kind: "loan.disbursed", command: "construction.contribute" },
  };
  witnessConstructionContribution(
    transition,
    { borrowerId: borrower.toHexString(), currency: "CAD", borrowerContributionLocal: 125 },
    { ledgerShadowEnabled: true, rates: new Map([["CAD", 1.25]]) }
  );
  await settleTransition(memory as unknown as Db, transition);
  expect(transition.projections[0].collection).toBe("ledgerEntries");
  await settleTransition(memory as unknown as Db, transition);
  expect(memory.collection("corporations").docs[0]!.liquidCapital).toBe(
    cash < 125 ? cash : cash - 125
  );
  const entries = memory.collection("ledgerEntries").docs;
  expect(entries).toHaveLength(cash < 125 ? 0 : 1);
  if (cash >= 125)
    expect(entries[0]!.legs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: `corporation:${borrower}:CAD`,
          amount: -125,
          anchorAmount: -100,
          role: "primary",
        }),
      ])
    );
});
