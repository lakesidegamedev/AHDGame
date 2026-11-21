"use client";

import { useTranslations } from "next-intl";
import { useCurrency } from "@/contexts/CurrencyContext";
import { investmentForecastInput } from "../lib/investment";
import { forecastSectorInvestment } from "@/lib/corporations/investment/rules";
import type { PlantsData } from "../types";

export default function InvestmentForecast({
  plants,
  units,
}: {
  plants: PlantsData;
  units: number;
}) {
  const t = useTranslations("corporations.sectorInvestment");
  const { formatAmount } = useCurrency();
  const input = investmentForecastInput(plants, units);
  const forecast = input ? forecastSectorInvestment(input) : null;
  if (!forecast) return <p className="text-body-sm text-muted">{t("noForecast")}</p>;
  return (
    <div>
      <h3 className="text-body-sm font-semibold text-foreground">{t("forecastTitle")}</h3>
      <table className="mt-1 w-full text-body-xs tabular-nums">
        <thead>
          <tr className="text-left text-muted">
            <th scope="col" className="py-0.5 font-medium" />
            <th scope="col" className="py-0.5 text-right font-medium">
              {t("cashReturn")}
            </th>
            <th scope="col" className="py-0.5 text-right font-medium">
              {t("cashAvailable")}
            </th>
          </tr>
        </thead>
        <tbody>
          {forecast.map((point) => (
            <tr key={point.turns} className="border-t border-card-border">
              <th scope="row" className="py-0.5 text-left font-normal">
                {t("horizon", { turns: point.turns })}
              </th>
              <td
                className={`py-0.5 text-right ${point.availableCashAnchor > 0 ? "text-success" : "text-warning"}`}
              >
                {point.cashReturnPercent.toFixed(1)}%
              </td>
              <td className="py-0.5 text-right">{formatAmount(point.availableCashAnchor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
