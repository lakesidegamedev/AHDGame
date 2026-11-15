import { COMMODITY_LABELS } from "@/lib/constants/commoditiesCore";
import { useTranslations } from "next-intl";
import type { BuildDemandRow } from "@/lib/corporations/rules/fundedBuildDemand";
import { fullMixBuildRoom } from "@/lib/corporations/rules/buildDemandCapacity";

export default function FundedBuildDemand({
  rows,
  turn,
  unitsPerFacility,
}: {
  rows?: BuildDemandRow[];
  turn?: number;
  unitsPerFacility?: number;
}) {
  const t = useTranslations("corporations.sectorInvestment.fundedAdvice");
  if (!rows) return null;
  const number = (value: number | null) =>
    value == null ? t("unknown") : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const sized = unitsPerFacility != null && unitsPerFacility > 0;
  const fullMix = fullMixBuildRoom(rows);
  return (
    <section className="rounded-lg border border-border p-3" aria-label={t("title")}>
      <h3 className="text-body-sm font-semibold">
        {turn != null ? t("titleTurn", { turn }) : t("title")}
      </h3>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full text-left text-body-xs">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr>
              <th>{t("outputMarket")}</th>
              <th>{t("funded")}</th>
              <th>{t("delivered")}</th>
              <th>{t("unfilled")}</th>
              {sized && <th>{t("buildings")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.commodity}:${row.scope}`}>
                <th scope="row" className="py-1 font-normal">
                  {COMMODITY_LABELS[row.commodity]} / {t(row.scope)}
                </th>
                <td>{number(row.funded)}</td>
                <td>{number(row.delivered)}</td>
                <td>{number(row.unmet)}</td>
                {sized && (
                  <td>
                    {number(
                      row.capacityUnits == null
                        ? null
                        : Math.ceil(row.capacityUnits / unitsPerFacility)
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sized && (
        <>
          <p className="mt-2 text-body-xs font-semibold">
            {t("fullMix", {
              count:
                fullMix == null ? t("unknown") : number(Math.floor(fullMix / unitsPerFacility)),
            })}
          </p>
          <p className="mt-1 text-body-xs text-muted">{t("buildingNote")}</p>
          <p className="mt-2 text-body-xs text-warning">{t("partialOutput")}</p>
        </>
      )}
      <p className="mt-2 text-body-xs text-muted">{t("deliveryNote")}</p>
      <p className="mt-2 text-body-xs text-muted">{t("scopeNote")}</p>
      <p className="mt-1 text-body-xs text-muted">{t("salesNote")}</p>
    </section>
  );
}
