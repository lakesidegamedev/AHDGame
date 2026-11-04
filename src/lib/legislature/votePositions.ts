import { isPolicyProvision, type BillProvision } from "@/lib/db/types/legislation";
import type { StateBillProvision } from "@/lib/db/types/stateBill";
import { v2VotePosition } from "@/lib/resetLegislation/rules/voterReactions";

/** One adapter for the executed vote and every ideology preview. */
export function billVotePositions(provisions: readonly (BillProvision | StateBillProvision)[]) {
  return provisions.flatMap(
    (provision): Array<{ economic?: number; social?: number; includeNeutral?: boolean }> => {
      if (provision.type === "reset_law") {
        const position = v2VotePosition(provision);
        return position ? [position] : [];
      }
      return isPolicyProvision(provision as BillProvision)
        ? [provision as { economic?: number; social?: number }]
        : [];
    }
  );
}
