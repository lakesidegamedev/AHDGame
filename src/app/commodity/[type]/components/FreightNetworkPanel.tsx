import type { CommodityDetail } from "../types";
import type { CountryId } from "@/lib/constants/countries";
import { getStateDisplayName } from "@/lib/commodity-map";
import { formatUnits } from "../lib/helpers";
import { useTranslations } from "next-intl";

export default function FreightNetworkPanel({ data }: { data: CommodityDetail }) {
  const t = useTranslations("corporations.freightNetwork");
  const network = data.freightNetwork;
  if (!network) return null;

  const rows = Object.entries(network.states)
    .map(([stateId, freight]) => ({
      stateId,
      countryId: (data.stateCountryMap?.[stateId] ?? "US") as CountryId,
      ...freight,
    }))
    .sort((a, b) => (b.fullCapacityOneHopEstimate ?? -1) - (a.fullCapacityOneHopEstimate ?? -1));

  const totals = rows.reduce(
    (sum, row) => ({
      estimate: sum.estimate + (row.fullCapacityOneHopEstimate ?? 0),
      load: sum.load + row.observedLoad,
      capacity: sum.capacity + row.capacity,
    }),
    { estimate: 0, load: 0, capacity: 0 }
  );
  const unavailableStates = rows.filter((row) => row.fullCapacityOneHopEstimate == null).length;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-card-border bg-card">
      <div className="border-b border-card-border px-5 py-4">
        <h2 className="text-lg font-bold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("explanation")}
          {unavailableStates > 0 && t("unavailableStates", { count: unavailableStates })}
        </p>
      </div>
      <div className="overflow-x-auto px-5 pb-4">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-card-border text-left text-xs font-semibold text-muted">
              <th className="py-2">{t("state")}</th>
              <th className="py-2 text-right">{t("oneHopEstimate")}</th>
              <th className="py-2 text-right">
                {t("observedLoad", {
                  turnLabel: network.turn == null ? "" : t("turnLabel", { turn: network.turn }),
                })}
              </th>
              <th className="py-2 text-right">{t("capacity")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.stateId} className="border-b border-card-border/30 last:border-0">
                <td className="py-2 font-medium text-foreground">
                  {getStateDisplayName(row.countryId, row.stateId)}
                </td>
                <td className="py-2 text-right tabular-nums text-foreground">
                  {row.fullCapacityOneHopEstimate == null
                    ? t("estimateUnavailable")
                    : formatUnits(row.fullCapacityOneHopEstimate, "TEU/day")}
                </td>
                <td className="py-2 text-right tabular-nums text-muted">
                  {formatUnits(row.observedLoad, "TEU/day")}
                </td>
                <td className="py-2 text-right tabular-nums text-muted">
                  {formatUnits(row.capacity, "TEU/day")}
                </td>
              </tr>
            ))}
            <tr className="border-t border-card-border font-semibold">
              <td className="py-2 text-foreground">
                {unavailableStates > 0 ? t("subtotal") : t("total")}
              </td>
              <td className="py-2 text-right tabular-nums text-foreground">
                {formatUnits(totals.estimate, "TEU/day")}
              </td>
              <td className="py-2 text-right tabular-nums text-muted">
                {formatUnits(totals.load, "TEU/day")}
              </td>
              <td className="py-2 text-right tabular-nums text-muted">
                {formatUnits(totals.capacity, "TEU/day")}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
