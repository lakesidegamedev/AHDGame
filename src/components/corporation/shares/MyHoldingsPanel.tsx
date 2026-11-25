"use client";

import { KVList, KVRow } from "../dense/DenseKit";
import { LedgerTicket } from "../ledger/LedgerTicket";

import { useCurrency } from "@/contexts/CurrencyContext";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { useTranslations } from "next-intl";
import {
  availableHoldingShares,
  SHORT_TERM_HOLDING_TURNS,
  type ShareHoldingTerms,
} from "@/lib/corporations/rules/holdingTerms";

interface MyHoldingsPanelProps {
  holdingTerms?: ShareHoldingTerms;
  turn?: number;
  myShares: number;
  myShareValue: number;
  myOwnershipPct: number;
  /** Personal balance in the character's home currency, face value. */
  myCashOnHand: number;
  myHomeCurrency?: string;
  myEscrowedTotal: number;
}

export default function MyHoldingsPanel({
  myShares,
  myShareValue,
  myOwnershipPct,
  myCashOnHand,
  myHomeCurrency,
  myEscrowedTotal,
  holdingTerms,
  turn = 0,
}: MyHoldingsPanelProps) {
  const { formatAmount, toInternalFrom } = useCurrency();
  // The balance is a face amount in the home currency; formatAmount takes internal units.
  const myCashInternal = myHomeCurrency
    ? toInternalFrom(myCashOnHand, myHomeCurrency as CurrencyCode)
    : myCashOnHand;
  const t = useTranslations("profile.stockHoldings");

  // Hidden when the user holds no shares
  if (myShares === 0) return null;

  return (
    <LedgerTicket title="Your holdings">
      <KVList>
        {holdingTerms && (
          <>
            {(["short", "long"] as const).map((term) => (
              <KVRow
                key={term}
                label={t(term)}
                value={t("shares", { count: availableHoldingShares(holdingTerms, term) })}
              />
            ))}
          </>
        )}
        <KVRow
          label="Shares"
          value={myShares.toLocaleString("en-US")}
          hint={`${myOwnershipPct.toFixed(2)}%`}
        />
        <KVRow label="Market value" value={formatAmount(myShareValue)} />
        <KVRow
          label="Personal cash"
          value={formatAmount(myCashInternal)}
          title="Your own cash, the same figure as the bottom bar. It does not include money reserved in buy orders or company cash."
        />
        {myEscrowedTotal > 0 && (
          <KVRow
            label="Reserved in buy orders"
            value={
              <span className="text-warning">{formatAmount(Math.round(myEscrowedTotal))}</span>
            }
          />
        )}
      </KVList>
      {holdingTerms && (
        <ul className="mt-2 space-y-1 text-body-sm text-muted">
          {holdingTerms.shortTermLots.map((lot) => (
            <li key={lot.acquiredTurn}>
              {t("purchaseTurn", {
                turn: lot.acquiredTurn,
                count: lot.shares,
                remaining: Math.max(0, SHORT_TERM_HOLDING_TURNS - (turn - lot.acquiredTurn)),
              })}
            </li>
          ))}
        </ul>
      )}
    </LedgerTicket>
  );
}
