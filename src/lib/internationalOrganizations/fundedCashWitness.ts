import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type { TransitionProjection } from "@/lib/banking/rules/boundary";
import { treasuryPaymentWitness } from "@/lib/budget/treasuryPaymentWitness";
import type { OrganizationCashContext, OrganizationFundedCashMove } from "./cashLedger";
import { organizationFundCashLegs } from "./rules/fundedCashWitness";

export function fundedOrganizationCashWitnesses(
  input: OrganizationFundedCashMove,
  context: OrganizationCashContext
): TransitionProjection[] {
  if (!context.ledgerShadowEnabled) return [];
  const turn = context.ledgerTurn ?? context.turn,
    now = new Date();
  return (["source", "destination"] as const).flatMap((side): TransitionProjection[] => {
    const cash = input[side],
      incoming = side === "destination";
    const country = incoming ? input.destinationTreasuryCountry : input.sourceTreasuryCountry;
    const key = `${input.key}:${side}`;
    if (country)
      return treasuryPaymentWitness({
        key,
        country,
        currency: cash.currencyCode,
        amount: cash.amount,
        rate: cash.localPerAnchor,
        turn,
        signedPositionOwned: true,
        incoming,
        reason: "organization_fund_cash",
        txType: "org_cash",
        now,
      });
    if (cash.collection !== "organizationFunds" || typeof cash.filter.organizationId !== "string")
      return [];
    return [
      {
        collection: "ledgerEntries",
        note: "Witness the funded organization balance",
        insert: {
          _id: new ObjectId(
            createHash("sha256")
              .update(key + ":fund-cash-witness")
              .digest("hex")
              .slice(0, 24)
          ),
          turn,
          createdAt: now,
          txType: "org_cash",
          balanced: true,
          emitSite: "internationalOrganizations/fundedCash",
          legs: organizationFundCashLegs(
            cash.filter.organizationId,
            cash.currencyCode,
            incoming ? cash.amount : -cash.amount,
            cash.localPerAnchor
          ),
        },
      },
    ];
  });
}
