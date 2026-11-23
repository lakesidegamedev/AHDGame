"use client";

import { useCurrency } from "@/contexts/CurrencyContext";
import { settledSectorRevenuePerTurn } from "../settledRevenue";
import type { SectorData, Financials, CorporationRef } from "../types";
import type { CurrencyCode } from "@/lib/constants/currencies";

interface AbandonPanelProps {
  sector: SectorData;
  financials: Financials | null;
  corporation: CorporationRef;
  abandonConfirm: boolean;
  abandoning: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onShowConfirm: () => void;
}

export default function AbandonPanel({
  sector,
  financials,
  corporation,
  abandonConfirm,
  abandoning,
  onConfirm,
  onCancel,
  onShowConfirm,
}: AbandonPanelProps) {
  const { formatAmount, toInternalFrom } = useCurrency();
  const liquidCode = (corporation.liquidCurrencyCode as CurrencyCode | undefined) ?? undefined;
  const fmtMoney = (value: number) =>
    formatAmount(liquidCode ? toInternalFrom(value, liquidCode) : value, liquidCode);
  if (!abandonConfirm) {
    return (
      <div className="rounded-xl border border-error/20 bg-error/5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-error">Abandon sector</h3>
            <p className="text-xs text-muted mt-0.5">
              An NPP operator takes over most of its built plants. This cannot be undone.
            </p>
          </div>
          <button
            onClick={onShowConfirm}
            className="rounded-lg border border-error/30 bg-error/10 px-4 py-2 text-sm font-medium text-error transition-colors hover:bg-error/20"
          >
            Abandon
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-error/20 bg-error/5 p-6">
      <div className="space-y-3">
        <p className="text-sm text-error font-medium">
          Abandon {sector.sectorLabel} in {sector.stateName}?
        </p>
        <p className="text-xs text-muted">
          {financials
            ? `You give up ${fmtMoney(settledSectorRevenuePerTurn(financials))}/turn in revenue, the settled figure on the sector overview.`
            : "This cannot be undone."}
        </p>
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
          <li>
            Cash: abandoning pays nothing for built plants. Build orders not yet delivered are
            cancelled and refunded at 75% of what you paid.
          </li>
          <li>
            Plants: an NPP operator takes over most of the built plants; the rest stop and the
            market reopens to builders.
          </li>
          <li>Workers: the sector&apos;s jobs end with it. No severance is paid.</li>
          <li>Unsold stock: stock held at the sector is lost. It is not sold or paid out.</li>
          <li>
            Contracts: a defence contract moves to the NPP operator when it can hold it. An
            extraction concession moves only if you have no other extraction plant in that state.
          </li>
        </ul>
        <div className="flex items-center gap-3">
          <button
            onClick={onConfirm}
            disabled={abandoning}
            className="rounded-lg bg-error px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-error/90 disabled:opacity-50"
          >
            {abandoning ? "Abandoning..." : "Confirm abandon"}
          </button>
          <button
            onClick={onCancel}
            disabled={abandoning}
            className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
