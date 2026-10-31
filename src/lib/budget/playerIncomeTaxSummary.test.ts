import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  loadPlayerIncomeTaxSummary,
  loadUnpaidIncomeTaxByCharacter,
} from "./playerIncomeTaxSummary";
describe("player tax liability valuation", () => {
  it("shows partial arrears and old bills collected recently, while excluding withholding from debt", async () => {
    const memory = createInMemoryDb();
    const db = memory as unknown as Db;
    const id = new ObjectId();
    memory.seed("playerIncomeTaxAssessments", [
      {
        _id: "partial",
        characterId: id,
        ownerCollection: "characters",
        status: "unpaid",
        turn: 1,
        currency: "USD",
        sourceFx: 1,
        gross: 1000,
        federal: 80,
        regional: 20,
        collectedFederal: 28,
        collectedRegional: 7,
        collectedTurn: 480,
        net: 900,
      },
      {
        _id: "old-paid",
        characterId: id,
        ownerCollection: "characters",
        status: "paid",
        turn: 2,
        currency: "USD",
        sourceFx: 1,
        gross: 500,
        federal: 50,
        regional: 0,
        collectedTurn: 480,
        net: 450,
      },
      {
        _id: "held",
        characterId: id,
        ownerCollection: "characters",
        status: "unpaid",
        turn: 480,
        currency: "USD",
        sourceFx: 1,
        gross: 500,
        federal: 50,
        regional: 0,
        withheldAtSource: true,
        net: 450,
      },
    ]);
    const statement = await loadPlayerIncomeTaxSummary(db, { _id: id }, 480);
    expect(statement.unpaidTaxAnchor).toBe(65);
    expect((await loadUnpaidIncomeTaxByCharacter(db)).get(id.toHexString())).toBe(65);
    expect(statement.assessments).toHaveLength(3);
    expect(statement.assessments.find((row) => row.turn === 1)).toMatchObject({
      tax: 100,
      paidTax: 35,
      remainingTax: 65,
      collectedTurn: 480,
    });
    expect(statement.assessments.find((row) => row.turn === 480)).toMatchObject({
      paidTax: 50,
      remainingTax: 0,
      withheldAtSource: true,
    });
  });
  it.each([0, -1, NaN, Infinity])(
    "uses the same frozen FX fallback in statements and wealth for %s",
    async (currentRate) => {
      const memory = createInMemoryDb(),
        characterId = new ObjectId(),
        db = memory as unknown as Db;
      memory.seed("playerIncomeTaxAssessments", [
        {
          _id: "synthetic-tax",
          characterId,
          ownerCollection: "characters",
          turn: 1,
          status: "unpaid",
          currency: "USD",
          sourceFx: 2,
          gross: 500,
          federal: 80,
          regional: 20,
          net: 400,
        },
      ]);
      const statement = await loadPlayerIncomeTaxSummary(
        db,
        { _id: characterId },
        1,
        "characters",
        { USD: currentRate }
      );
      const wealth = await loadUnpaidIncomeTaxByCharacter(db, { USD: currentRate });
      expect(statement.unpaidTaxAnchor).toBe(50);
      expect(wealth.get(characterId.toHexString())).toBe(50);
    }
  );
});
