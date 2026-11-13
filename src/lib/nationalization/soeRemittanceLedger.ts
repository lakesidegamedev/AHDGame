import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type { TransitionProjection } from "@/lib/banking/rules/boundary";
import { soeRemittanceCashLegs } from "./rules/soeRemittanceLedger";

export function soeRemittanceCashWitness(
  input: Parameters<typeof soeRemittanceCashLegs>[0] & { key: string; turn: number; now: Date }
): TransitionProjection {
  return {
    collection: "ledgerEntries",
    note: "Witness funded SOE profit remittance",
    insert: {
      _id: new ObjectId(
        createHash("sha256")
          .update(input.key + ":cash-witness")
          .digest("hex")
          .slice(0, 24)
      ),
      turn: input.turn,
      createdAt: input.now,
      txType: "soe_remittance",
      emitSite: "nationalization/soeRemittance",
      balanced: true,
      legs: soeRemittanceCashLegs(input),
    },
  };
}
