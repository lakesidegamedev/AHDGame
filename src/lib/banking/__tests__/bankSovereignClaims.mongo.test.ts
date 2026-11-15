import { readFundedBankMaturityCash } from "@/lib/turn/bondTurnBankMaturityCash";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { settleBankSovereignClaims } from "../bankSovereignClaims";
import {
  REAL_MONGO_ENABLED,
  startIsolatedMongod,
  stopIsolatedMongod,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";

const BANK_ID = new ObjectId("66d000000000000000000002");
const CLAIM_ID = "bank-sovereign-coupon:US:12:66d000000000000000000002:4";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.runIf(REAL_MONGO_ENABLED)(
  "funded sovereign income counters on isolated real Mongo",
  () => {
    let fixture: IsolatedMongod | null = null;
    let db: Db;

    beforeAll(async () => {
      fixture = await startIsolatedMongod("ahd-funded-coupon-income-");
      db = fixture.db;
    });

    afterAll(async () => {
      await stopIsolatedMongod(fixture);
      fixture = null;
    });

    it("replays a lost acknowledgment without splitting vault cash from its paid-income counter", async () => {
      await db.collection<StringIdDocument>("federalBudget").insertOne({
        _id: "federal",
        countryId: "US",
        treasuryBalance: 100,
        treasuryCashLocal: 100,
        bankSovereignClaims: [
          {
            id: CLAIM_ID,
            kind: "coupon",
            bankId: BANK_ID.toHexString(),
            charteredTurn: 4,
            countryId: "US",
            currencyCode: "USD",
            amountLocal: 10,
            turn: 12,
            bondIds: ["66d000000000000000000003"],
            anchorRate: 1,
            treasuryCashLedgerEnabled: true,
          },
        ],
      });
      await db.collection("corporations").insertOne({
        _id: BANK_ID,
        bankCharter: {
          status: "active",
          currency: "USD",
          charteredTurn: 4,
          cashReserves: 5,
          lastBankingIncome: 37,
          lastBankingIncomeTurn: 12,
        },
      });

      let loseCreditAck = true;
      const crashDb = new Proxy(db, {
        get(target, property, receiver) {
          if (property !== "collection") return Reflect.get(target, property, receiver);
          return (name: string) => {
            const collection = target.collection(name);
            if (name !== "corporations") return collection;
            return new Proxy(collection, {
              get(col, operation, collectionReceiver) {
                if (operation !== "updateOne")
                  return Reflect.get(col, operation, collectionReceiver);
                return async (...args: unknown[]) => {
                  const result = await col.updateOne(
                    args[0] as Parameters<typeof col.updateOne>[0],
                    args[1] as Parameters<typeof col.updateOne>[1],
                    args[2] as Parameters<typeof col.updateOne>[2]
                  );
                  const update = args[1] as { $inc?: Record<string, number> };
                  if (
                    loseCreditAck &&
                    (update.$inc?.["bankCharter.cashReserves"] ?? 0) > 0 &&
                    (update.$inc?.["bankCharter.sovereignCouponIncomePaidLifetime"] ?? 0) > 0
                  ) {
                    loseCreditAck = false;
                    throw new Error("injected lost Mongo acknowledgment after paired bank credit");
                  }
                  return result;
                };
              },
            });
          };
        },
      }) as unknown as Db;

      const frozen = await db.collection<StringIdDocument>("federalBudget").findOne({
        _id: "federal",
      });
      await expect(settleBankSovereignClaims(crashDb, frozen as never, 13)).rejects.toThrow(
        "injected lost Mongo acknowledgment after paired bank credit"
      );

      const paidAfterLostAck = await db.collection("corporations").findOne({ _id: BANK_ID });
      expect(paidAfterLostAck?.bankCharter?.cashReserves).toBe(15);
      expect(paidAfterLostAck?.bankCharter?.sovereignCouponIncomePaidLifetime).toBe(10);
      expect(paidAfterLostAck?.bankCharter?.lastBankingIncome).toBe(37);

      await settleBankSovereignClaims(db, frozen as never, 14);
      await settleBankSovereignClaims(db, frozen as never, 15);
      const afterReplay = await db.collection("corporations").findOne({ _id: BANK_ID });
      expect(afterReplay?.bankCharter?.cashReserves).toBe(15);
      expect(afterReplay?.bankCharter?.sovereignCouponIncomePaidLifetime).toBe(10);
      expect(
        await db
          .collection<StringIdDocument>("bankMoneyMoves")
          .countDocuments({ _id: `${CLAIM_ID}:bank:13` })
      ).toBe(1);
      expect(
        await db
          .collection<StringIdDocument>("federalBudget")
          .countDocuments({ "bankSovereignClaims.id": CLAIM_ID })
      ).toBe(0);
    });

    it("re-marks a bank as soon as a maturity pays, so the redemption is not counted twice", async () => {
      // Ticket 1749: the banking phase marked 8.86M of a bond due that turn, the bond
      // phase then paid 8.86M into the vault, and until the next banking phase the
      // bank counted both, which inflated what its owner could withdraw.
      const bankId = new ObjectId("66d000000000000000000012");
      const bondId = new ObjectId("66d000000000000000000013");
      const claimId = `bank-sovereign-maturity:${bondId.toHexString()}:${bankId.toHexString()}:4`;
      await db.collection<StringIdDocument>("federalBudget").deleteMany({});
      await db.collection<StringIdDocument>("federalBudget").insertOne({
        _id: "federal",
        countryId: "US",
        treasuryBalance: 10_000,
        treasuryCashLocal: 10_000,
        bankSovereignClaims: [
          {
            id: claimId,
            kind: "maturity",
            bankId: bankId.toHexString(),
            charteredTurn: 4,
            bondId: bondId.toHexString(),
            countryId: "US",
            currencyCode: "USD",
            amountLocal: 8_000,
            turn: 12,
            anchorRate: 1,
            treasuryCashLedgerEnabled: true,
            ledgerShadow: true,
          },
        ],
      });
      await db.collection("bonds").insertOne({
        _id: bondId,
        issuerType: "sovereign",
        countryId: "US",
        currencyCode: "USD",
        faceValue: 1000,
        maturityTurn: 12,
        matured: true,
        holders: [],
      });
      await db.collection("corporations").insertOne({
        _id: bankId,
        bankCharter: {
          status: "active",
          currency: "USD",
          charteredTurn: 4,
          cashReserves: 500,
          // Marked by the banking phase before the bond phase redeemed it.
          sovereignTreasuryMarkValue: 8_000,
          lastTreasuryMarkTurn: 12,
        },
      });

      const frozen = await db
        .collection<StringIdDocument>("federalBudget")
        .findOne({ _id: "federal" });
      await settleBankSovereignClaims(db, frozen as never, 12);

      const after = await db.collection("corporations").findOne({ _id: bankId });
      expect(after?.bankCharter?.cashReserves).toBe(8_500);
      expect(after?.bankCharter?.sovereignTreasuryMarkValue).toBe(0);
      expect(await readFundedBankMaturityCash(db, 12)).toEqual({ US: 8_000 });
      await settleBankSovereignClaims(db, frozen as never, 12);
      expect(await readFundedBankMaturityCash(db, 12)).toEqual({ US: 8_000 });
      expect(await readFundedBankMaturityCash(db, 13)).toEqual({});
    });
  }
);
