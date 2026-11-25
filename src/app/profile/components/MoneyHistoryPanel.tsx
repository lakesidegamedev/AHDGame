"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import type { CurrencyCode } from "@/lib/constants/currencyCodes";
import { formatCurrencyFaceAmount } from "@/lib/currency/formatCurrencyFaceAmount";
import type { MoneyHistoryRow, MoneyHistoryWallet } from "@/lib/character/moneyHistory/rules";
import { pillClass } from "@/components/ui/selectedState";

interface HistoryPage {
  rows: MoneyHistoryRow[];
  nextCursor: string | null;
}

type Filter = "all" | MoneyHistoryWallet;

const FILTERS: Filter[] = ["all", "personal", "campaign"];

/** The signed-in player's own money in and out, with a labelled source on every line. */
export function MoneyHistoryPanel() {
  const t = useTranslations("profile.finances.moneyHistory");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<MoneyHistoryRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (next: Filter, after: string | null) => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (next !== "all") params.set("wallet", next);
      if (after) params.set("cursor", after);
      const res = await fetch(`/api/character/money-history?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as HistoryPage;
      setRows((prev) => (after ? [...prev, ...page.rows] : page.rows));
      setCursor(page.nextCursor);
      setLoaded(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const showBalance = rows.some((row) => row.balanceAfter !== null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) void load(filter, null);
  };

  const pick = (next: Filter) => {
    setFilter(next);
    setRows([]);
    setCursor(null);
    void load(next, null);
  };

  return (
    <div className="mt-6 border-t border-card-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-body-lg font-semibold">{t("title")}</h3>
          <p className="text-body-sm text-muted">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="rounded-md border border-card-border px-2.5 py-1 text-body-sm font-medium text-foreground transition-colors hover:bg-card-elevated"
        >
          {open ? t("hide") : t("show")}
        </button>
      </div>

      {open && (
        <div className="mt-4">
          <div className="mb-3 flex gap-2" role="group">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => pick(f)}
                aria-pressed={filter === f}
                className={`px-3 py-1 text-body-sm ${pillClass(filter === f)}`}
              >
                {t(f)}
              </button>
            ))}
          </div>

          {error && <p className="text-body-sm text-error">{t("error")}</p>}
          {loaded && rows.length === 0 && !loading && !error && (
            <p className="text-body-sm text-muted">{t("empty")}</p>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1 pr-3">{t("turn")}</th>
                    <th className="py-1 pr-3">{t("source")}</th>
                    <th className="py-1 pr-3 text-right">{t("amount")}</th>
                    {showBalance && <th className="py-1 text-right">{t("balance")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={`${row.at}-${i}`} className="border-t border-card-border/60">
                      <td className="py-1 pr-3 tabular-nums">{row.turn}</td>
                      <td className="py-1 pr-3">
                        {t(`kinds.${row.kind}`)}
                        {row.counterparty ? `: ${row.counterparty}` : ""}
                      </td>
                      <td
                        className={`py-1 pr-3 text-right tabular-nums ${
                          row.amount < 0 ? "text-error" : "text-success"
                        }`}
                      >
                        {formatCurrencyFaceAmount(row.amount, row.currencyCode as CurrencyCode)}
                      </td>
                      {showBalance && (
                        <td className="py-1 text-right tabular-nums">
                          {row.balanceAfter === null
                            ? "-"
                            : formatCurrencyFaceAmount(
                                row.balanceAfter,
                                row.currencyCode as CurrencyCode
                              )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {showBalance && <p className="mt-2 text-body-sm text-muted">{t("balanceNote")}</p>}
            </div>
          )}

          {loading && <p className="text-body-sm text-muted">{t("loading")}</p>}
          {cursor && !loading && (
            <button
              type="button"
              onClick={() => void load(filter, cursor)}
              className="mt-2 text-body-sm underline"
            >
              {t("loadMore")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
