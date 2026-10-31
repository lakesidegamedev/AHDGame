import { TAXABLE_PLAYER_INCOME_TYPES } from "@/lib/budget/rules/incomeTaxTiers";
import { incomeWindow, recurringIncomePerTurn, type IncomeWindowClock } from "./rules/income";
import type { Db } from "mongodb";
import type { Character } from "@/lib/db/types";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import { getGameState } from "@/lib/gameState";
import { fromInternalUnits, toInternalUnits } from "./locMath";

/**
 * LOC underwriting uses a rolling income average instead of a one-turn snapshot.
 * This keeps short-lived income spikes from instantly inflating the credit limit.
 */
const LOC_INCOME_AVERAGING_TURNS = 48;

const LOC_RECURRING_INCOME_TX_TYPES: FinancialTxLogEntry["type"][] = [
  ...TAXABLE_PLAYER_INCOME_TYPES,
  "player_income_tax",
];

/**
 * Average recurring personal income per turn in home-currency face units.
 * Uses actual paid recurring-income tx rows over the recent underwriting window
 * rather than live holdings, so LOC limits reflect demonstrated income history.
 * The window starts after the world's last economy reset.
 */
export async function estimatePerTurnCurrencyIncomeHomeFace(
  db: Db,
  character: Character,
  rates: Partial<Record<CurrencyCode, number>>,
  gameState?: IncomeWindowClock & { preset?: string }
): Promise<number> {
  const state = gameState ?? (await getGameState(db));
  const home = getHomeCurrency(character, state?.preset);
  const rateHome = rates[home] ?? 1;
  const {
    startTurn: windowStartTurn,
    endTurn: currentTurn,
    observationTurns,
  } = incomeWindow(state ?? {}, LOC_INCOME_AVERAGING_TURNS);
  if (observationTurns === 0) return 0;

  const rows = await db
    .collection<FinancialTxLogEntry>("financialTxLog")
    .find({
      subjectType: "character",
      subjectId: character._id,
      type: { $in: LOC_RECURRING_INCOME_TX_TYPES },
      turn: { $gte: windowStartTurn, $lte: currentTurn },
    })
    .project({ amount: 1, currencyCode: 1, anchorAmount: 1 })
    .toArray();

  let totalInternal = 0;
  for (const row of rows) {
    if (typeof row.anchorAmount === "number" && Number.isFinite(row.anchorAmount)) {
      totalInternal += row.anchorAmount;
      continue;
    }

    const currencyCode = row.currencyCode as CurrencyCode;
    const rate = rates[currencyCode];
    if (!rate || rate <= 0) continue;
    totalInternal += toInternalUnits(row.amount, rate);
  }

  const averageInternalPerTurn = recurringIncomePerTurn(totalInternal, observationTurns);
  return fromInternalUnits(averageInternalPerTurn, rateHome);
}
