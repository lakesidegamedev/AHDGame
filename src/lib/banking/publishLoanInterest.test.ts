import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { publishBankLoanInterestHistory } from "./publishLoanInterest";
import type { Db } from "mongodb";
it.each([
  {
    name: "actual cash interest",
    paid: 125,
    currency: "USD",
    processed: 10,
    originated: 1,
    expected: 125,
  },
  { name: "a fully serviced zero payment", processed: 10, originated: 1, expected: 0 },
  { name: "an unserviced eligible loan", processed: 9, originated: 1, expected: undefined },
  { name: "a new loan not due this turn", originated: 10, expected: 0 },
  {
    name: "foreign paid units without a historical conversion",
    paid: 125,
    currency: "JPY",
    processed: 10,
    originated: 1,
    expected: undefined,
  },
])("publishes $name without guessing missing payment evidence", async (c) => {
  const memory = createInMemoryDb(),
    corp = new ObjectId(),
    row = new ObjectId();
  memory.seed("corporationHistory", [
    { _id: row, corporationId: corp, turn: 10, currencyCode: "USD", income: 1000 },
  ]);
  memory.seed("corporations", [
    {
      _id: corp,
      liquidCapital: 5000,
      ...(c.paid === undefined
        ? {}
        : {
            bankLoanInterestPaidByTurn: { "10": c.paid },
            bankLoanInterestCurrencyByTurn: { "10": c.currency },
          }),
    },
  ]);
  memory.seed("bankLoans", [
    {
      _id: new ObjectId(),
      borrowerType: "corporation",
      borrowerId: corp,
      status: "current",
      originatedTurn: c.originated,
      lastProcessedTurn: c.processed,
    },
  ]);
  await publishBankLoanInterestHistory(memory as unknown as Db, 10);
  await publishBankLoanInterestHistory(memory as unknown as Db, 10);
  expect(memory.collection("corporationHistory").docs[0].settledBankLoanInterestPaid).toBe(
    c.expected
  );
  expect(memory.collection("corporations").docs[0].liquidCapital).toBe(5000);
});
it("publishes zero when no eligible loans exist, without changing cash", async () => {
  const memory = createInMemoryDb(),
    corp = new ObjectId();
  memory.seed("corporationHistory", [
    { _id: new ObjectId(), corporationId: corp, turn: 10, currencyCode: "USD" },
  ]);
  memory.seed("corporations", [{ _id: corp, liquidCapital: 5000 }]);
  expect(await publishBankLoanInterestHistory(memory as unknown as Db, 10)).toBe(1);
  expect(memory.collection("corporationHistory").docs[0].settledBankLoanInterestPaid).toBe(0);
  expect(memory.collection("corporations").docs[0].liquidCapital).toBe(5000);
});
