import type { Migration } from "../types";
import { STATE_BILL_PARTY_NPP_INDEX } from "@/lib/legislature/stateBillPartyNppIndex";

export const migration: Migration = {
  id: "2026-10-27-party-npp-regional-bills",
  description:
    "Guard concurrent chair-directed regional bills. Optional proposalPayerId needs no backfill; legacy bills keep sponsor-based refunds.",
  idempotent: true,
  execute: async (db, ctx) => {
    if (!ctx.dryRun) {
      await db
        .collection("stateBills")
        .createIndex(STATE_BILL_PARTY_NPP_INDEX.key, STATE_BILL_PARTY_NPP_INDEX.options);
    }
    return {
      documentsUpdated: 0,
      notes: [
        ctx.dryRun
          ? "Would create party NPP bill uniqueness index"
          : "Created or verified party NPP bill uniqueness index",
      ],
    };
  },
};
