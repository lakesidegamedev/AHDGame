/**
 * Reporting phases that run after the turn commits and releases its lock
 * (`src/simulation/engine/postLockReporting.ts` owns the runner).
 *
 * A phase belongs here only if nothing that simulates the world reads what it
 * writes: no later phase of the same turn, no phase of the next turn, and no
 * player action. Each entry names its readers:
 *
 * - partyHistorySnapshot: `partyHistory`, read by the party history page and
 *   analytics only.
 * - researchTelemetry: country-turn and securities research rows, read by the
 *   research export only.
 * - gameHealthSnapshot: `gameHealthSnapshots`, read by admin health pages and
 *   sim metrics. Economic vital signs used to read its inflation block; it now
 *   reads the national budgets directly.
 * - portfolioSnapshot, corpPortfolioSnapshot: portfolio history, read by
 *   portfolio pages, recaps and the post-turn suspect scan.
 * - investorRankingSnapshot: the investor ranking page only.
 *
 * Phases that look like reporting but stay inside the lock, because game logic
 * reads their output: approvalSnapshot (live approval, war exhaustion),
 * metricHistory (auto-crisis triggers and the vote model read the history),
 * interestRateSnapshot (forex, inflation and banking read the rate history),
 * primarySnapshots (accrues primary ballots), resetMetricRefresh (authoritative
 * v2 metrics), moneySupplySnapshot (next turn's inflation), the shadow ledger
 * pair (needs a world no player can write to), economicVitalSigns (the
 * financial crisis trigger), and stockExchangeSnapshot and wealthListSnapshot
 * (vital signs reads both for the same turn).
 */
import { resolveLongHorizonContext } from "@/lib/telemetry/longHorizon/telemetry";
import { appendCountryTurnTelemetry } from "@/lib/telemetry/research/countryTurn";
import { appendSecurityTelemetry } from "@/lib/telemetry/research/securities";
import { snapshotPartyHistory } from "@/lib/turn/partyHistorySnapshot";
import {
  snapshotPortfolioValues,
  snapshotCorporationPortfolioValues,
} from "@/lib/turn/portfolioSnapshot";
import { generateInvestorRankingSnapshot } from "@/lib/turn/stockExchangeSnapshot";
import { processGameHealthSnapshot } from "@/lib/turn/gameHealthSnapshot";
import type { PostLockReportingStep } from "@/simulation/engine/postLockReporting";

export const postLockReportingSteps: readonly PostLockReportingStep[] = [
  {
    // Graded first: it reads the turn's own statuses and warnings, which are
    // complete now, rather than the partial set it saw mid-turn.
    key: "turnHealth",
    phases: ["gameHealthSnapshot"],
    async execute(context, runtime) {
      const { db, newTurn, currentYear, warnings, phaseStatuses } = context;
      const healthResult = await runtime.runPhase("gameHealthSnapshot", () =>
        processGameHealthSnapshot(
          db,
          newTurn,
          currentYear,
          context.committedDurationMs,
          warnings.length === 0,
          [...warnings],
          phaseStatuses
        )
      );
      if (healthResult) context.phaseResults.gameHealthSnapshot = healthResult;
    },
  },
  {
    key: "historySnapshots",
    phases: [
      "partyHistorySnapshot",
      "researchTelemetry",
      "portfolioSnapshot",
      "corpPortfolioSnapshot",
      "investorRankingSnapshot",
    ],
    async execute(context, runtime) {
      const { db, newTurn } = context;
      const [, , portfolioSnapshotResult] = await Promise.all([
        runtime.runPhase("partyHistorySnapshot", () => snapshotPartyHistory(db, newTurn)),
        // Research panels (#2331, #2332, #2336). A failure here must never
        // stop anything, so it is isolated and only logged.
        runtime.runPhase("researchTelemetry", async () => {
          const longHorizonCtx = await resolveLongHorizonContext(db, newTurn);
          if (!longHorizonCtx) return;
          const observedAt = new Date();
          await Promise.all([
            appendCountryTurnTelemetry(db, longHorizonCtx, newTurn, observedAt),
            appendSecurityTelemetry(db, longHorizonCtx, newTurn, observedAt),
          ]).catch((error) => {
            console.error("[researchTelemetry] write failed", error);
          });
        }),
        runtime.runPhase("portfolioSnapshot", () =>
          snapshotPortfolioValues(newTurn, context.gameState.stockHoldingTaxStartTurn)
        ),
        runtime.runPhase("corpPortfolioSnapshot", () =>
          snapshotCorporationPortfolioValues(newTurn)
        ),
        runtime.runPhase("investorRankingSnapshot", () =>
          generateInvestorRankingSnapshot(newTurn, db)
        ),
      ]);
      context.phaseResults.portfolioSnapshot = {
        charactersSnapshotted: portfolioSnapshotResult ?? 0,
      };
    },
  },
];
