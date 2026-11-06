/**
 * Funded-market zero-sales pass for AI-run corporations: reopen the plant whose recipe is
 * shortest, and mothball every plant that has sold nothing for the threshold of settled turns.
 */
import type { ObjectId } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { chooseFundedRestart } from "@/lib/market/producerMarket/fundedRestartRules";
import type { NppCorpDecision, NppCorpDecisionContext } from "@/lib/turn/npp/corpDecisionTypes";
import type { OperatorPermissions } from "@/lib/turn/npp/rules/operatorPolicy";
import {
  AI_ZERO_SALES_MOTHBALL_TURNS,
  inManualRestartGrace,
} from "@/lib/turn/npp/nppCorporationTuning";

interface FundedZeroSalesInput {
  ctx: NppCorpDecisionContext;
  operator: OperatorPermissions;
  sectors: CorporateSector[];
  divestedSectorIds: ObjectId[];
  newlyMothballedIds: Set<string>;
  sectorUpdates: NppCorpDecision["sectorUpdates"];
  now: Date;
}

/**
 * 2e. Funded market: an AI-run corporation mothballs every plant that has
 * sold nothing for two settled turns, instead of one plant a turn. Its wages
 * and site bills buy nothing; the glut restart brings it back when the
 * market's price recovers. Player autopilot and caretakers never do this.
 */
export function pushFundedZeroSalesMothballs({
  ctx,
  operator,
  sectors,
  divestedSectorIds,
  newlyMothballedIds,
  sectorUpdates,
  now,
}: FundedZeroSalesInput): void {
  if (
    ctx.transitionFirstFundedTurn != null &&
    operator.role === "npp" &&
    !ctx.corp.countryOwnerId
  ) {
    // Funded restart: reopen the mothballed plant whose recipe is shortest.
    const reopen = ctx.fundedRestartPressureOf
      ? chooseFundedRestart(
          sectors,
          ctx.fundedRestartPressureOf,
          (s) =>
            !divestedSectorIds.some((d) => d.equals(s._id)) &&
            !(s.sectorType === "extraction" && s.capacityUtilization === 0)
        )
      : null;
    if (reopen)
      sectorUpdates.push({
        filter: { _id: reopen._id, mothballed: true },
        update: {
          $set: { mothballed: false, producerZeroSalesTurns: 0, pnlLossTurns: 0, updatedAt: now },
        },
      });
    for (const sector of sectors) {
      if (reopen && sector._id.equals(reopen._id)) continue;
      const id = sector._id.toString();
      if (sector.mothballed === true || newlyMothballedIds.has(id)) continue;
      if (inManualRestartGrace(sector, ctx.turn)) continue;
      if ((sector.producerZeroSalesTurns ?? 0) < AI_ZERO_SALES_MOTHBALL_TURNS) continue;
      sectorUpdates.push({
        filter: { _id: sector._id, mothballed: { $ne: true } },
        update: { $set: { mothballed: true, updatedAt: now } },
      });
      newlyMothballedIds.add(id);
    }
  }
}
