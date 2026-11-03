import Image from "next/image";
import Link from "next/link";
import { STATE_FLAGS } from "@/lib/constants";
import { bypassNextImageOptimization } from "@/lib/images/bypassImageOptimization";
import { signTone } from "../dense/DenseKit";
import { PlantCount, RunningSoldReading, sectorPlantCount } from "../plantsPresentation";
import { DataBar } from "../dense/InlineViz";
import { sectorMargin, sectorRevenue } from "../overviewModel";
import type { SectorDetail } from "../CorporationPageTypes";

function Figure({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-[13px] tabular-nums ${className}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * The Overview's sector list on a phone: one card per sector carrying the
 * same figures as the desktop table row.
 */
export function SectorCards({
  sectors,
  corpId,
  plantsMode,
  fogged,
  fmt,
  fmtSigned,
  scale,
  maxRevenue,
}: {
  sectors: SectorDetail[];
  corpId: string;
  plantsMode: boolean;
  fogged: boolean;
  fmt: (local: number) => string;
  fmtSigned: (local: number) => string;
  scale: (daily: number) => number;
  maxRevenue: number;
}) {
  const est = (text: string) => (fogged ? `~${text}` : text);
  return (
    <ul className="divide-y divide-card-border">
      {sectors.map((s) => {
        const flag = STATE_FLAGS[s.stateId];
        const margin = sectorMargin(s);
        const hasRevenue = typeof s.revenue === "number";
        return (
          <li key={s._id} className="flex flex-col gap-2.5 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/corporation/${corpId}/sector/${s._id}`}
                className="inline-flex min-w-0 items-center gap-2 font-semibold text-foreground hover:underline"
              >
                {flag && (
                  <Image
                    src={flag}
                    alt=""
                    width={20}
                    height={13}
                    className="h-[13px] w-5 shrink-0 rounded-[2px] object-cover"
                    unoptimized={bypassNextImageOptimization(flag)}
                  />
                )}
                <span className="truncate">{s.displayName ?? s.stateName}</span>
              </Link>
              <span className="shrink-0 text-xs text-muted">
                {s.sectorLabel}
                {s.embargoSuspended && <span className="ml-1.5 text-error">embargo</span>}
                {s.mothballed && <span className="ml-1.5">mothballed</span>}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                Revenue
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
                {hasRevenue ? est(fmt(scale(sectorRevenue(s)))) : "n/a"}
              </span>
            </div>
            {hasRevenue && <DataBar value={sectorRevenue(s)} max={maxRevenue} />}
            <div className="grid grid-cols-3 gap-2">
              <Figure label="Margin" className={signTone(margin)}>
                {margin != null ? `${margin.toFixed(1)}%` : "n/a"}
              </Figure>
              <Figure label="Profit" className={signTone(s.profit)}>
                {typeof s.profit === "number" ? est(fmtSigned(scale(s.profit))) : "n/a"}
              </Figure>
              {plantsMode ? (
                <Figure label="Plants">
                  <PlantCount sector={s} />
                </Figure>
              ) : (
                <Figure label="Share" className="text-muted">
                  {typeof s.marketSharePercent === "number"
                    ? `${s.marketSharePercent.toFixed(1)}%`
                    : "n/a"}
                </Figure>
              )}
            </div>
            {plantsMode && (
              <RunningSoldReading
                produced={s.producedUnits}
                capacity={s.capacityUnits}
                fill={s.fillRate}
                band={s.fillRateBand}
                plantCount={sectorPlantCount(s)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
