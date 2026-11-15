import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type { TransitionProjection } from "@/lib/banking/rules/boundary";
import type { SovereignMaturityCashLeg } from "./sovereignMaturityPayoutTargets";
import { sovereignPoolMaturityCashLegs } from "./rules/sovereignPoolMaturityLedger";

/** Only cash actually sent to a pool is witnessed; novated face has no cash credit. */
export function sovereignPoolMaturityWitness(
  key: string,
  turn: number,
  now: Date,
  paidLegs: readonly SovereignMaturityCashLeg[],
  currentLegs: readonly SovereignMaturityCashLeg[]
): TransitionProjection[] {
  return paidLegs
    .filter((leg) => leg.collection === "bondMarketPools" && leg.amount > 0)
    .map((leg, index) => {
      const rate =
        currentLegs.find(
          (current) =>
            current.collection === "bondMarketPools" && current.currencyCode === leg.currencyCode
        )?.localPerAnchor ?? leg.localPerAnchor;
      return {
        collection: "ledgerEntries",
        note: "Witness funded sovereign pool maturity cash",
        insert: {
          _id: new ObjectId(
            createHash("sha256")
              .update(`${key}:pool-cash-witness:${index}`)
              .digest("hex")
              .slice(0, 24)
          ),
          turn,
          createdAt: now,
          txType: "bond_maturity",
          emitSite: "bonds/sovereignPoolMaturity",
          balanced: true,
          legs: sovereignPoolMaturityCashLegs(leg.currencyCode, leg.amount, rate),
        },
      };
    });
}
