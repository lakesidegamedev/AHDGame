import { COMMODITY_LABELS } from "@/lib/constants/commoditiesCore";
import { useTranslations } from "next-intl";
import type { BuildDemandRow } from "@/lib/corporations/rules/fundedBuildDemand";
import { fullMixBuildRoom } from "@/lib/corporations/rules/buildDemandCapacity";

const numHead = "px-1 py-1 text-right font-medium sm:px-2";
const numCell = "px-1 py-1 text-right tabular-nums sm:px-2";

export default function FundedBuildDemand({
  rows,
  unitsPerFacility,
}: {
  rows?: BuildDemandRow[];
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
      <h3 className="text-body-lg font-semibold">{t("title")}</h3>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full table-fixed text-left text-body-sm sm:table-auto">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="align-bottom text-muted">
              <th scope="col" className="w-[34%] py-1 pr-2 font-medium sm:w-auto">
                {t("outputMarket")}
              </th>
              <th scope="col" className={numHead}>
                {t("funded")}
              </th>
              <th scope="col" className={numHead}>
                {t("delivered")}
              </th>
              <th scope="col" className={numHead}>
                {t("unfilled")}
              </th>
              {sized && (
                <th scope="col" className={numHead}>
                  {t("buildings")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.commodity}:${row.scope}`}
                className="border-t border-border/50 align-top"
              >
                <th scope="row" className="break-words py-1 pr-2 font-normal">
                  {COMMODITY_LABELS[row.commodity]} / {t(row.scope)}
                </th>
                <td className={numCell}>{number(row.funded)}</td>
                <td className={numCell}>{number(row.delivered)}</td>
                <td className={numCell}>{number(row.unmet)}</td>
                {sized && (
                  <td className={numCell}>
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
        <p className="mt-2 text-body-sm font-semibold">
          {t("fullMix", {
            count: fullMix == null ? t("unknown") : number(Math.floor(fullMix / unitsPerFacility)),
          })}
        </p>
      )}
      <p className="mt-1 text-body-sm text-muted">{t("scopeNote")}</p>
    </section>
  );
}
