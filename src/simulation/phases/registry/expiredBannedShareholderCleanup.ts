import { processExpiredBannedShareholders } from "@/lib/account/processExpiredBannedShareholders";
import { processInactiveShareholderShares } from "@/lib/account/processInactiveShareholderShares";
import { processInactiveCeoCorpShares } from "@/lib/account/processInactiveCeoCorpShares";

import type { TurnPhaseAdapter } from "@/simulation/engine/types";
export function getExpiredBannedShareholderCleanupPhases(): TurnPhaseAdapter[] {
  return [
    {
      key: "expiredBannedShareholderCleanup",
      async execute(context, runtime) {
        const { db, realNow, newTurn, gameState, phaseResults } = context;
        const result = await runtime.runPhase("bannedShareholderRelease", () =>
          processExpiredBannedShareholders(db, {
            now: realNow,
            currentTurn: newTurn,
            forexEnabled: gameState.forexEnabled === true,
          })
        );
        if (result) {
          phaseResults.bannedShareholderRelease = {
            usersProcessed: result.usersProcessed,
            sharesReleasedToFloat: result.sharesReleasedToFloat,
            ceoCorpsVacated: result.ceoCorpsVacated,
            ordersCancelled: result.ordersCancelled,
            listingsCancelled: result.listingsCancelled,
            offersCancelled: result.offersCancelled,
          };
        }
      },
    },

    {
      key: "inactiveShareholderShareRelease",
      async execute(context, runtime) {
        const { db, realNow, gameState, phaseResults } = context;
        const result = await runtime.runPhase("inactiveShareholderShareRelease", async () => {
          const forexEnabled = gameState.forexEnabled === true;
          // User-side: personally-held shares of inactive users. Corp-side:
          // cross-corp equity held by corps whose CEO is inactive. Both before
          // the corporation turn so float/holdings are settled for dividends.
          const userSide = await processInactiveShareholderShares(db, {
            now: realNow,
            forexEnabled,
          });
          const corpSide = await processInactiveCeoCorpShares(db, {
            now: realNow,
            forexEnabled,
          });
          return {
            usersProcessed: userSide.usersProcessed,
            corpsProcessed: corpSide.corpsProcessed,
            corpsWarned: corpSide.corpsWarned,
            warningsSent: corpSide.warningsSent,
            sharesReleasedToFloat: userSide.sharesReleasedToFloat + corpSide.sharesReleasedToFloat,
            sharePositionsReleased:
              userSide.sharePositionsReleased + corpSide.sharePositionsReleased,
            ordersCancelled: userSide.ordersCancelled + corpSide.ordersCancelled,
            listingsCancelled: userSide.listingsCancelled + corpSide.listingsCancelled,
            offersCancelled: userSide.offersCancelled + corpSide.offersCancelled,
          };
        });
        if (result) {
          phaseResults.inactiveShareholderShareRelease = result;
        }
      },
    },
  ];
}
