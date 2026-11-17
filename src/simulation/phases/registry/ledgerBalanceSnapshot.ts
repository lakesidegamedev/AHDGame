import { isLedgerShadowEnabledFromConfig } from "@/lib/ledger/featureFlag";
import { writeBalanceSnapshot } from "@/lib/ledger/balanceSnapshot";

import { reconcileTurn } from "@/lib/ledger/reconcile";
import { snapshotEconomicVitalSigns } from "@/lib/economy/economicVitalSigns";

import type { TurnPhaseAdapter } from "@/simulation/engine/types";
export function getLedgerBalanceSnapshotPhases(): TurnPhaseAdapter[] {
  return [
    // Shadow ledger (registered LAST): snapshot money balances after all
    // value-affecting phases, then reconcile shadow entries against the diff.
    // Shadow-only, flag-gated (`ledgerShadow`), zero game-behavior impact.
    {
      key: "ledgerBalanceSnapshot",
      async execute(context, runtime) {
        const { db, newTurn, config, phaseResults } = context;
        if (!isLedgerShadowEnabledFromConfig(config)) {
          await runtime.markPhaseSkipped(
            "ledgerBalanceSnapshot",
            "featureDisabled",
            "Skipped because the shadow ledger flag is off."
          );
          return;
        }
        const accountsSnapshotted = await runtime.runPhase("ledgerBalanceSnapshot", () =>
          writeBalanceSnapshot(db, newTurn, {
            treasuryCashLedgerEnabled: config?.treasuryCashLedgerEnabled,
          })
        );
        if (accountsSnapshotted !== null) {
          phaseResults.ledgerBalanceSnapshot = { accountsSnapshotted };
        }
      },
    },

    {
      key: "ledgerReconcile",
      async execute(context, runtime) {
        const { db, newTurn, config, phaseResults, warnings } = context;
        if (!isLedgerShadowEnabledFromConfig(config)) {
          await runtime.markPhaseSkipped(
            "ledgerReconcile",
            "featureDisabled",
            "Skipped because the shadow ledger flag is off."
          );
          return;
        }
        // Stamp banking mode from the already-loaded turn config: no extra
        // round trips, and the persisted doc carries per-turn banking history.
        const report = await runtime.runPhase("ledgerReconcile", () =>
          reconcileTurn(db, newTurn, { savingsAccountsMode: config?.savingsAccountsMode ?? null })
        );
        if (report) {
          phaseResults.ledgerReconcile = {
            status: report.status,
            entriesChecked: report.entriesChecked,
            unbalancedCount: report.trialBalance.unbalancedCount,
            stockVsFlowDivergences: report.stockVsFlow.divergentCount,
          };
          if (report.trialBalance.status === "red") {
            warnings.push(
              `[ledger] ${report.trialBalance.unbalancedCount} unbalanced ledger entr` +
                `${report.trialBalance.unbalancedCount === 1 ? "y" : "ies"} at turn ${newTurn}`
            );
          }
        }
      },
    },

    {
      key: "economicVitalSigns",
      async execute(context, runtime) {
        const snapshot = await runtime.runPhase("economicVitalSigns", () =>
          snapshotEconomicVitalSigns(context.db, context.newTurn)
        );
        if (snapshot) {
          context.phaseResults.economicVitalSigns = {
            snapshotTurn: snapshot.turn,
            domainsAvailable: [
              snapshot.goods.pooledFillRate,
              snapshot.trade.intentFulfillmentRate,
              snapshot.production.physicalSellThrough,
              snapshot.firms.marketCapHhi,
              snapshot.securities.activeTradedListingShare,
              snapshot.households.wealthGini,
              snapshot.money.medianAnnualizedM2GrowthPct,
            ].filter((item) => item.value !== null).length,
          };
        }
      },
    },
  ];
}
