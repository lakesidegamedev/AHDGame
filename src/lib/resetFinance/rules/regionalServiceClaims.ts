import type { RegionalProgramClaim } from "@/lib/governmentFinance/rules/regionalSettlement";
import {
  regionalOpeningBoardPayload,
  type ResetRegionalOpeningBoard,
} from "./regionalOpeningBoard";

/** Unmapped existing services cannot be silently repealed by enacting an unrelated program. */
export function regionalOpeningServiceClaims(
  board: ResetRegionalOpeningBoard
): Array<RegionalProgramClaim & { category: string }> {
  regionalOpeningBoardPayload([board]);
  if (!board.existingServicesByCategory)
    throw new Error(`Missing frozen opening service categories for ${board._id}`);
  return Object.entries(board.existingServicesByCategory).map(([category, amount]) => ({
    category,
    programId: `opening-services:${board._id}:${category}`,
    legislationTypeId: `opening-services:${category}`,
    policyOptionId: "opening",
    authorizedCost: amount,
    obligationPriority: 5,
    fundingSemantics: "appropriation_included",
    continuing: true,
  }));
}
