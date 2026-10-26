import { describe, expect, it } from "vitest";
import { batchedServiceMove } from "@/lib/banking/namedLoanBook";
import { oid } from "@/lib/banking/rules/boundary";

type Decisions = Parameters<typeof batchedServiceMove>[0];

function decision(borrowerHex: string, payment: number) {
  return {
    loan: {},
    borrowerKey: `corporation:${borrowerHex}`,
    decision: { payment },
    transition: {
      legs: [
        {
          kind: "debit",
          amount: payment,
          collection: "corporations",
          filter: { _id: oid(borrowerHex) },
          path: "liquidCapital",
        },
      ],
      projections: [],
    },
  };
}

describe("batchedServiceMove", () => {
  it("keeps one debit per borrower when filters use $oid refs", () => {
    const a = "6ac5202ca08893ef7ac1d8ac";
    const b = "6ac3e240c6e9f850d9777c06";
    const { legs } = batchedServiceMove(
      [decision(a, 100), decision(b, 40), decision(a, 10)] as unknown as Decisions,
      {
        collection: "corporations",
        filter: { _id: oid("6acba7267f0eaca56be74741") },
        path: "x",
      } as never,
      {}
    );
    const debits = legs.filter((leg) => leg.kind === "debit");
    expect(debits).toHaveLength(2);
    const byBorrower = Object.fromEntries(
      debits.map((leg) => [(leg.filter as { _id: { $oid: string } })._id.$oid, leg.amount])
    );
    expect(byBorrower).toEqual({ [a]: 110, [b]: 40 });
    expect(legs.find((leg) => leg.kind === "credit")?.amount).toBe(150);
  });
});
