import type { Migration } from "../types";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import type { Document } from "mongodb";

export const migration: Migration = {
  id: "2026-10-04-construction-service-lease-index",
  description: "Index unfinished construction instalment epoch leases.",
  idempotent: true,
  execute: async (db, ctx) => {
    if (!ctx.dryRun) {
      await corporationsCollection(db).createIndex(
        { "bankConstructionFunding.service.turn": 1 },
        { name: "corporations_construction_service_turn", sparse: true }
      );
      await corporationsCollection(db).createIndex(
        { "bankCharter.currency": 1, "bankCharter.status": 1, _id: 1 },
        { name: "corporations_construction_lender_currency_status" }
      );
      await corporateSectorsCollection<Document>(db).createIndex(
        { "constructionFinancing.cancellation.turn": 1 },
        { name: "corporateSectors_construction_cancel_turn", sparse: true }
      );
      await corporateSectorsCollection<Document>(db).createIndex(
        { "constructionFinancing.status": 1, "constructionFinancing.requestTransition.turn": 1 },
        { name: "corporateSectors_construction_funding_turn", sparse: true }
      );
      await corporateSectorsCollection<Document>(db).createIndex(
        { "constructionFinancing.sale.turn": 1 },
        { name: "corporateSectors_construction_sale_turn", sparse: true }
      );
      await corporateSectorsCollection<Document>(db).createIndex(
        { "constructionFinancing.defaultedTurn": 1 },
        { name: "corporateSectors_construction_default_turn", sparse: true }
      );
    }
    return {
      documentsUpdated: 0,
      notes: [
        ctx.dryRun
          ? "Would create construction service recovery index"
          : "Created or verified construction service recovery index",
      ],
    };
  },
};
