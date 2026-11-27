/** The bounded unfinished cash-plan queue is read before every corporation turn. */
export const SUPPLY_CASH_PLAN_INDEX = {
  keys: { worldId: 1, supplyProjectionsComplete: 1, turn: 1 },
  options: {
    name: "bankMoneyMoves_supply_cash_recovery",
    partialFilterExpression: {
      kind: "turn-value-settlement",
      phase: "supply-agreement-cash",
      status: "applied",
    },
  },
} as const;
