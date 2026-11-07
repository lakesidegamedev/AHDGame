/** Non-unique lookup indexes for per-turn bank maintenance and servicing. */
export const BANKING_TURN_READ_INDEXES = [
  {
    collection: "corporations",
    key: { npcBankSeedKey: 1 },
    name: "corporations_npcBankSeedKey",
    sparse: true,
  },
  // A scoped wildcard covers existing and future currencies without one index per currency.
  {
    collection: "characters",
    key: { "currencyBalances.savingsHolder.$**": 1 },
    name: "characters_savingsHolder_currency",
  },
  {
    collection: "bankLoans",
    key: { bankCorporationId: 1, status: 1, borrowerType: 1, lastProcessedTurn: 1 },
    name: "bankLoans_bank_status_borrower_turn",
  },
] as const;
