import type { Migration } from "../types";
import { NATIONAL_PARTY_NPP_INDEX } from "@/lib/legislature/nationalPartyNppIndex";
import { billsCollection } from "@/lib/db/repositories/bills";
import type { Document } from "mongodb";
export const migration: Migration = {
  id: "2026-10-27-national-party-npp-bills",
  description:
    "One active national NPP bill per party across chambers; optional payer ids need no backfill.",
  idempotent: true,
  execute: async (db, ctx) => {
    if (!ctx.dryRun)
      await billsCollection<Document>(db)
        .createIndex(NATIONAL_PARTY_NPP_INDEX.key, NATIONAL_PARTY_NPP_INDEX.options);
    return {
      documentsUpdated: 0,
      notes: [
        "Existing duplicate active NPP bills must resolve before index creation; no bills are deleted.",
      ],
    };
  },
};
