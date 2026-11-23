"use client";

import { getOutputMultiplier } from "@/lib/utils/productionPolicy";
import { useTranslations } from "next-intl";
import { InfoTooltip } from "@/components/InfoTooltip";
import type { PlantIdleCause } from "../types";
import {
  idleCauseMeta,
  IDLE_CAUSE_FILL,
  TONE_FILL,
  fmtUnits,
  fmtPct,
  madeShareOfCapacity,
} from "../lib/plants";
import type { OperatingSectorType } from "@/lib/constants/corporationsClient";
import { facilityPlural } from "@/lib/constants/facilityVocabulary";

interface RunMeterProps {
  /** Installed capacity, units/day. The whole bar. */
  capacityUnits: number;
  /** Units made this turn. */
  producedUnits: number;
  /** Units that found a buyer. */
  soldUnits: number;
  /** Output used by the company's other sites, on the same daily basis. */
  ownSiteUnits?: number;
  /** Named reasons the rest of the capacity did not run. Sums to the idle slice. */
  idleCauses: PlantIdleCause[];
  /** Drives the facility noun in the segment help text. */
  sectorType: OperatingSectorType;
  /** Outputs that sell only in this state; explains a demand limit beside a wider shortage. */
  localMarketOutputs?: string[];
  /** Dim the whole meter (mothballed plants). */
  dimmed?: boolean;
  /** Current production policy level (-25..25); output above capacity comes from a positive push. */
  productionPolicyLevel?: number;
}

type SegmentGroup = "made" | "stopped" | "unplanned";

/**
 * Legend groups. A slice either ran, was planned but stopped this turn (cash,
 * inputs, workers: fixed by supplying what was missing), or was never planned
 * (the plan sits below full: fixed by price, demand or time). Two labels that
 * both said "cash" read as the same thing (ticket 1767); under their group they
 * read as "stopped this turn" and "plan kept low after an earlier cut".
 */
const GROUP_OF: Record<string, SegmentGroup> = {
  inputs: "stopped",
  cash: "stopped",
  staffing: "stopped",
  strike: "stopped",
  disaster: "stopped",
  deposits: "stopped",
};
const GROUP_TITLE: Record<SegmentGroup, string> = {
  made: "Made",
  stopped: "Planned, but stopped this turn",
  unplanned: "Not in the plan",
};

interface Segment {
  key: string;
  group: SegmentGroup;
  label: string;
  units: number;
  fill: string;
  help: string;
}

/**
 * THE SIGNATURE ELEMENT of the plants sector page: one bar showing today's run
 * across the whole of the sector's installed capacity, split into sold, made
 * but unsold, and idle by named reason.
 *
 * Every segment is drawn from the persisted turn factors and the segments sum
 * to capacity exactly, so the picture and the numbers beside it can never
 * disagree. The legend beneath is the teaching surface: it names WHY capacity
 * did not run, which is the one question the old capacity panel could not
 * answer.
 */
export default function RunMeter({
  capacityUnits,
  producedUnits,
  soldUnits,
  ownSiteUnits = 0,
  idleCauses,
  sectorType,
  localMarketOutputs = [],
  dimmed = false,
  productionPolicyLevel = 0,
}: RunMeterProps) {
  const sites = facilityPlural(sectorType);
  const t = useTranslations("corporations.runHold");
  const causeMeta = idleCauseMeta(sectorType, localMarketOutputs);
  const capacity = capacityUnits > 0 ? capacityUnits : 0;
  const sold = Math.max(0, Math.min(producedUnits, soldUnits));
  const ownSite = Math.max(0, Math.min(producedUnits - sold, ownSiteUnits));
  const unsold = Math.max(0, producedUnits - sold - ownSite);

  const segments: Segment[] = [
    {
      key: "sold",
      group: "made",
      label: "Made and sold",
      units: sold,
      fill: TONE_FILL.sold,
      help: `Units your ${sites} made and outside buyers took. These sales bring money into the company.`,
    },
    {
      key: "own-sites",
      group: "made",
      label: "Sent to your sites",
      units: ownSite,
      fill: "bg-sky-500",
      help: "Output used by your company's other sites. The internal supply policy sets its allocated price. These deliveries do not change your company's total cash.",
    },
    {
      key: "unsold",
      group: "made",
      label: "Made, not sold",
      units: unsold,
      fill: TONE_FILL.unsold,
      help: "Units you made last turn that nobody bought at your posted price, counted against what was made. The Unsold figure in the sales panel counts against units offered, which includes stock carried in, so the two can differ. You paid to make them. Lower your price or build less.",
    },
    ...idleCauses.map((c) => {
      // A sold-out run cut by an input or by cash names what holds it (ticket 1765).
      const meta =
        c.cause === "held"
          ? {
              ...causeMeta.held,
              label: c.heldInput ? t("heldByInput", { input: c.heldInput }) : t("heldByCash"),
              help: c.heldInput
                ? t("heldByInputHelp", { input: c.heldInput, sites })
                : t("heldByCashHelp", { sites }),
            }
          : c.cause === "inputs" && c.heldInput
            ? {
                ...causeMeta.inputs,
                label: t("stoppedByInput", { input: c.heldInput }),
                help: t("stoppedByInputHelp", { input: c.heldInput, sites }),
              }
            : causeMeta[c.cause];
      return {
        key: `idle-${c.cause}`,
        group: GROUP_OF[c.cause] ?? "unplanned",
        label: meta.label,
        units: c.units,
        // Per cause, not per tone: the bar segment and the legend dot below
        // share this one value, so a cause can never carry two colours.
        fill: IDLE_CAUSE_FILL[c.cause] ?? TONE_FILL[meta.tone],
        help: meta.help,
      };
    }),
  ];

  const share = (units: number) => (capacity > 0 ? units / capacity : 0);
  // A production push can make more than installed capacity. Legend shares
  // stay "of capacity" (so they can pass 100%, and a note says why), while the
  // bar is drawn against whichever is larger so it never overflows its track.
  const overCapacity = capacity > 0 && producedUnits > capacity + 0.5;
  const madeShare = madeShareOfCapacity(producedUnits, capacity) ?? 0;
  const pushCap = getOutputMultiplier(productionPolicyLevel);
  const pastPushCap = madeShare > pushCap + 0.005;
  const barBasis = Math.max(
    capacity,
    segments.reduce((sum, s) => sum + Math.max(0, s.units), 0)
  );
  const barShare = (units: number) => (barBasis > 0 ? units / barBasis : 0);

  /**
   * Drop slices too small to say anything. A cause carrying 0.4 of 693 units
   * passed a bare `units > 0` filter and then rendered as "Waiting on inputs
   * 0 0%" — a legend row naming a cause that visibly did nothing, and a bar
   * segment under a pixel wide. A slice earns a row when it rounds to at least
   * one unit or to at least one percent.
   */
  const GROUP_ORDER: SegmentGroup[] = ["made", "stopped", "unplanned"];
  // Bar and legend in the same group order, so a segment sits beside its heading.
  const visible = segments
    .filter((s) => s.units >= 0.5 || share(s.units) >= 0.005)
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));

  /** Whole percent, except a real-but-tiny share reads "<1%" rather than "0%". */
  const shareLabel = (units: number) => {
    const value = share(units);
    return value > 0 && value < 0.005 ? "<1%" : fmtPct(value);
  };

  if (capacity <= 0) {
    return (
      <p className="rounded-lg border border-dashed border-card-border px-3 py-4 text-center text-body-sm text-muted">
        This sector has no capacity yet. Build some to start making things.
      </p>
    );
  }

  return (
    <div className={dimmed ? "opacity-60" : undefined}>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-track"
        role="img"
        aria-label={`Today's run: ${fmtUnits(sold)} of ${fmtUnits(capacity)} capacity units sold`}
      >
        {visible.map((s) => (
          <div
            key={s.key}
            className={`h-full ${s.fill} transition-[width] duration-500`}
            style={{ width: `${barShare(s.units) * 100}%` }}
          />
        ))}
      </div>
      {overCapacity && (
        <p className="mt-2 text-body-xs text-muted" data-testid="run-over-capacity">
          {productionPolicyLevel > 0
            ? `Made ${fmtPct(madeShare)} of installed capacity. Your production push (+${productionPolicyLevel}%) runs ${sites} past capacity, up to ${fmtPct(pushCap)} of it, at extra input cost and wear.${pastPushCap ? " Installed capacity is lower now than when last turn ran, so the share reads above that limit." : ""}`
            : `Made ${fmtPct(madeShare)} of installed capacity.`}
        </p>
      )}
      {GROUP_ORDER.map((group) => {
        const rows = visible.filter((s) => s.group === group);
        if (rows.length === 0) return null;
        return (
          <div key={group} className="mt-3">
            <p className="mb-1 text-body-xs font-semibold uppercase tracking-wide text-muted">
              {GROUP_TITLE[group]}
            </p>
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {rows.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-2">
                  <InfoTooltip
                    width={260}
                    trigger={
                      <span className="flex min-w-0 items-center gap-2 text-body-sm">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${s.fill}`} aria-hidden />
                        <span className="truncate border-b border-dotted border-muted/40 text-foreground">
                          {s.label}
                        </span>
                      </span>
                    }
                  >
                    <p className="mb-1 font-semibold text-foreground">{s.label}</p>
                    <p className="text-muted">{s.help}</p>
                  </InfoTooltip>
                  <span className="shrink-0 text-body-sm tabular-nums text-muted">
                    <span className="font-semibold text-foreground">{fmtUnits(s.units)}</span>{" "}
                    {shareLabel(s.units)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
