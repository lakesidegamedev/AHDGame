import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { BankingTransition } from "./rules/boundary";
import type { ConstructionBuildClaim } from "./rules/constructionBuild";
import { constructionContributionCashLegs } from "./rules/constructionCashWitness";

export interface ConstructionCashWitnessContext {
  ledgerShadowEnabled?: boolean;
  rates: ReadonlyMap<string, number>;
}

export function witnessConstructionContribution(
  transition: BankingTransition,
  claim: Pick<ConstructionBuildClaim, "borrowerId" | "currency" | "borrowerContributionLocal">,
  context: ConstructionCashWitnessContext | null
): void {
  if (!context?.ledgerShadowEnabled) return;
  const rate = context.rates.get(claim.currency) ?? 1;
  transition.projections.unshift({
    collection: "ledgerEntries",
    note: "Witness the funded borrower construction contribution",
    insert: {
      _id: new ObjectId(
        createHash("sha256")
          .update(transition.key + ":cash-witness")
          .digest("hex")
          .slice(0, 24)
      ),
      turn: transition.turn,
      createdAt: new Date(),
      txType: "corp_capacity_build",
      balanced: true,
      emitSite: "banking/constructionContribution",
      legs: constructionContributionCashLegs(
        claim.borrowerId,
        claim.currency as CurrencyCode,
        claim.borrowerContributionLocal,
        rate
      ),
    },
  });
}
