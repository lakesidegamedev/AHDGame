import { buildRoomVerdict } from "@/lib/corporations/rules/buildRoomVerdict";
import { COMMODITY_LABELS } from "@/lib/constants/commoditiesCore";
import { useTranslations } from "next-intl";
import type { BuildDemandRow } from "@/lib/corporations/rules/fundedBuildDemand";
import {
  buildMarketReadout,
  type ProductReadout,
} from "@/lib/corporations/rules/buildMarketReadout";

/**
 * What the build dialog shows about buyers: one row per product this site
 * makes, each with its own verdict, and one plain sentence on top.
 *
 * The old readout collapsed a mixed-output site to its tightest product, so a
 * campus with thousands of unserved electronics buyers read "0 recommended"
 * because software was covered. Players took that as a build cap.
 */
export default function BuildMarketReadout({
  rows,
  unitsPerFacility,
  site,
  sites,
  measuredRoomUnits,
}: {
  rows: BuildDemandRow[];
  unitsPerFacility: number;
  site: string;
  sites: string;
  /** The sector page's room-to-build figure, so both screens give one answer. */
  measuredRoomUnits?: number | null;
}) {
  const t = useTranslations("corporations.sectorInvestment.marketReadout");
  const readout = buildMarketReadout(rows, unitsPerFacility);
  if (readout.products.length === 0) return null;
  const names = (products: ProductReadout[]) =>
    products.map((p) => COMMODITY_LABELS[p.commodity]).join(", ");
  const waiting = readout.products.filter((p) => p.verdict === "waiting");
  const covered = readout.products.filter(
    (p) => p.verdict !== "waiting" && p.verdict !== "unknown"
  );

  const capSignal = readout.products.some((product) => product.capHiddenUnmet != null);
  const headline =
    readout.summary === "all-waiting"
      ? t("headlineAllWaiting", {
          count: readout.fullMixFacilities ?? 0,
          facility: site,
          facilities: sites,
        })
      : readout.summary === "some-waiting"
        ? capSignal
          ? t("headlineSomePaidOrdersWaiting", { waiting: names(waiting) })
          : t("headlineSomeWaiting", {
              waiting: names(waiting),
              covered: names(covered),
              facilities: sites,
            })
        : readout.summary === "none-waiting"
          ? capSignal
            ? t("headlinePaidOrdersCovered")
            : t("headlineNoneWaiting", { facilities: sites })
          : buildRoomVerdict(measuredRoomUnits) === "none"
            ? t("headlineNoRoom", { facilities: sites })
            : buildRoomVerdict(measuredRoomUnits) === "room"
              ? t("headlineRoomMeasured", { facilities: sites })
              : t("headlineUnknown");

  return (
    <section
      className="rounded-lg border border-card-border bg-background/40 p-3"
      aria-label={t("title")}
      data-testid="build-market-readout"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-body-sm font-semibold text-foreground">{t("title")}</h3>
        <span className="text-body-xs text-muted">{t("lastTurn")}</span>
      </div>
      <p className="mt-1 text-body-sm text-foreground" data-testid="build-market-headline">
        {headline}
      </p>
      <ul className="mt-3 space-y-2.5">
        {readout.products.map((product) => (
          <ProductRow key={product.commodity} product={product} site={site} sites={sites} />
        ))}
      </ul>
      {capSignal && (
        <p className="mt-3 text-body-xs text-muted">
          {readout.estimatedFullMixFacilities != null && readout.estimatedFullMixFacilities > 0
            ? t("capRoom", { count: readout.estimatedFullMixFacilities, site, sites })
            : t("capEstimate")}
        </p>
      )}
      <p className="mt-3 text-body-xs text-muted">{t("notALimit")}</p>
    </section>
  );
}

function ProductRow({
  product,
  site,
  sites,
}: {
  product: ProductReadout;
  site: string;
  sites: string;
}) {
  const t = useTranslations("corporations.sectorInvestment.marketReadout");
  const units = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const filledPct =
    product.ordered != null && product.ordered > 0 && product.filled != null
      ? Math.min(100, (100 * product.filled) / product.ordered)
      : null;
  const chip = {
    waiting: { text: t("chipWaiting"), cls: "border-success/40 bg-success/10 text-success" },
    "idle-covers": { text: t("chipIdle"), cls: "border-warning/40 bg-warning/10 text-warning" },
    covered: {
      text: t(product.capHiddenUnmet != null ? "chipPaidOrdersCovered" : "chipCovered"),
      cls: "border-card-border bg-card-elevated text-muted",
    },
    "no-orders": { text: t("chipNoOrders"), cls: "border-card-border bg-card-elevated text-muted" },
    unknown: { text: t("chipUnknown"), cls: "border-card-border bg-card-elevated text-muted" },
  }[product.verdict];
  const detail =
    product.verdict === "waiting"
      ? t("detailWaiting", {
          unmet: units(product.unmet ?? 0),
          count: product.facilities ?? 0,
          facility: site,
          facilities: sites,
        })
      : product.verdict === "idle-covers"
        ? t("detailIdle", { unmet: units(product.unmet ?? 0) })
        : product.verdict === "covered"
          ? t("detailCovered")
          : product.verdict === "no-orders"
            ? t("detailNoOrders")
            : t("detailUnknown");

  return (
    <li data-testid={`build-market-row-${product.commodity}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-body-sm font-medium text-foreground">
          {COMMODITY_LABELS[product.commodity]}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-body-xs font-semibold ${chip.cls}`}
        >
          {chip.text}
        </span>
      </div>
      {filledPct != null && (
        <div
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-success/60"
          role="img"
          aria-label={t("barLabel", {
            filled: units(product.filled ?? 0),
            ordered: units(product.ordered ?? 0),
          })}
        >
          <div className="h-full bg-muted" style={{ width: `${filledPct}%` }} />
        </div>
      )}
      <p className="mt-1 text-body-xs text-muted">
        {product.ordered != null && product.filled != null && (
          <span className="tabular-nums">
            {t("orderedFilled", { ordered: units(product.ordered), filled: units(product.filled) })}
            {" · "}
          </span>
        )}
        {detail}
      </p>
      {product.capHiddenUnmet != null && (
        <p className="mt-1 text-body-xs text-muted">
          {t("capProduct", { units: units(product.capHiddenUnmet) })}
        </p>
      )}
    </li>
  );
}
