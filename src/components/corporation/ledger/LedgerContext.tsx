"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Switches the shared DenseKit building blocks into the corporation page's
 * "ledger" look. Only the corporation page renders the provider, so every
 * other page that uses DenseKit keeps its current styling.
 */
const CorpLedgerContext = createContext(false);

export function CorpLedgerProvider({ children }: { children: ReactNode }) {
  return (
    <CorpLedgerContext.Provider value={true}>
      <div data-corp-ledger className="corp-ledger">
        {children}
      </div>
    </CorpLedgerContext.Provider>
  );
}

export function useCorpLedger(): boolean {
  return useContext(CorpLedgerContext);
}
