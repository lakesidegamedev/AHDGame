import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { Bond } from "@/lib/db/types";
import { assertNoBankTreasuryHolders } from "./payInstitutionalBondHolders";

const bond = (holders: Array<Record<string, unknown>>) =>
  ({ _id: new ObjectId(), holders }) as unknown as Pick<Bond, "_id" | "holders">;

describe("assertNoBankTreasuryHolders", () => {
  it("accepts bonds held by characters, corporations, funds and NPPs", () => {
    expect(() =>
      assertNoBankTreasuryHolders([
        bond([
          { characterId: new ObjectId(), units: 1 },
          { corporationId: new ObjectId(), units: 2 },
          { fundId: new ObjectId(), units: 3 },
          { nppId: new ObjectId(), units: 4 },
        ]),
      ])
    ).not.toThrow();
  });

  it("refuses a corporate bond that a bank treasury holds", () => {
    expect(() =>
      assertNoBankTreasuryHolders([bond([{ bankId: new ObjectId(), charteredTurn: 3, units: 5 }])])
    ).toThrow(/bank treasury holder/);
  });
});
