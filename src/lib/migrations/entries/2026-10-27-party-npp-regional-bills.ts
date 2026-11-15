import type { Migration } from "../types";
import { STATE_BILL_PARTY_NPP_INDEX } from "@/lib/legislature/stateBillPartyNppIndex";
import { stateBillsCollection } from "@/lib/db/repositories/stateBills";
import type { Document } from "mongodb";

export const migration: Migration = {
  id: "2026-10-27-party-npp-regional-bills",
  description:
    "Guard concurrent chair-directed regional bills. Optional proposalPayerId needs no backfill; legacy bills keep sponsor-based refunds.",
  idempotent: true,
  execute: async (db, ctx) => {
    if (!ctx.dryRun) {
      await stateBillsCollection<Document>(db).createIndex(
        STATE_BILL_PARTY_NPP_INDEX.key,
        STATE_BILL_PARTY_NPP_INDEX.options
      );
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
