"use client";

import Link from "next/link";
import type { CorpTabId, SectorDetail } from "./CorporationPageTypes";
import { DenseSection, SmallButton } from "./dense/DenseKit";
import { sectorBuildUrl } from "./plantsPresentation";

/** Fill at or above this sells (almost) everything the plants make. */
const SOLD_OUT_FILL = 0.98;
/** Fill below this means the plants make clearly more than the market takes. */
const OVERSUPPLIED_FILL = 0.85;
/** Undelivered share above this is worth flagging as a freight problem. */
const DELIVERY_LIMIT_FLAG = 0.05;

export interface GrowthLeverSector {
  id: string;
  label: string;
  /** Whole-number percent. */
  value: number;
}

export interface GrowthLevers {
  soldOut: GrowthLeverSector[];
  oversupplied: GrowthLeverSector[];
  deliveryLimited: GrowthLeverSector[];
}

function sectorLabel(s: SectorDetail): string {
  return `${s.stateName || s.stateId} ${s.displayName || s.sectorLabel}`;
}

/**
 * Sort a corporation's running plant sectors by what would grow them: sold-out
 * sectors grow by building, oversupplied ones do not, and delivery-limited
 * ones need freight before either. Largest sectors first, three per group.
 */
export function buildGrowthLevers(sectors: SectorDetail[]): GrowthLevers {
  const running = sectors
    .filter((s) => !s.mothballed && (s.capacityUnits ?? 0) > 0 && s.fillRate != null)
    .sort((a, b) => (b.capacityUnits ?? 0) - (a.capacityUnits ?? 0));
  const pick = (
    test: (s: SectorDetail) => boolean,
    value: (s: SectorDetail) => number
  ): GrowthLeverSector[] =>
    running
      .filter(test)
      .slice(0, 3)
      .map((s) => ({ id: s._id, label: sectorLabel(s), value: Math.round(value(s) * 100) }));
  const delivery = (s: SectorDetail) => s.deliveryLimitedFraction ?? 0;
  return {
    soldOut: pick(
      (s) => (s.fillRate ?? 0) >= SOLD_OUT_FILL,
      (s) => s.fillRate ?? 0
    ),
    deliveryLimited: pick((s) => delivery(s) > DELIVERY_LIMIT_FLAG, delivery),
    oversupplied: pick(
      (s) => (s.fillRate ?? 1) < OVERSUPPLIED_FILL && delivery(s) <= DELIVERY_LIMIT_FLAG,
      (s) => s.fillRate ?? 0
    ),
  };
}

function SectorLinks({
  corpId,
  items,
  suffix,
  build,
}: {
  corpId: string;
  items: GrowthLeverSector[];
  suffix: string;
  build?: boolean;
}) {
  return (
    <ul className="mt-1 space-y-0.5">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline gap-x-2">
          <Link
            href={
              build ? sectorBuildUrl(corpId, item.id) : `/corporation/${corpId}/sector/${item.id}`
            }
            className="text-primary hover:underline"
          >
            {item.label}
          </Link>
          <span className="tabular-nums text-muted">
            {item.value}% {suffix}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * CEO-only, plants economy: what actually grows this corporation and where to
 * act. Nothing grows on its own; revenue moves with plants that sell, inputs,
 * freight, techs and splits.
 */
export function GrowthLeversPanel({
  sectors,
  corpId,
  onTabChange,
}: {
  sectors: SectorDetail[];
  corpId: string;
  onTabChange: (tab: CorpTabId) => void;
}) {
  const levers = buildGrowthLevers(sectors);
  return (
    <DenseSection title="What grows this corporation">
      <div className="space-y-3 text-xs leading-relaxed">
        <p className="text-muted">
          Sectors do not grow on their own. Revenue rises when you add plants that can sell their
          output, cut what each plant costs to run, or take plants from rivals.
        </p>
        {levers.soldOut.length > 0 && (
          <div>
            <p className="font-medium text-foreground">
              Build here: these sectors sell everything they make.
            </p>
            <SectorLinks corpId={corpId} items={levers.soldOut} suffix="sold" build />
          </div>
        )}
        {levers.deliveryLimited.length > 0 && (
          <div>
            <p className="font-medium text-foreground">
              Fix freight first: part of this output never reaches a buyer.
            </p>
            <SectorLinks corpId={corpId} items={levers.deliveryLimited} suffix="undelivered" />
          </div>
        )}
        {levers.oversupplied.length > 0 && (
          <div>
            <p className="font-medium text-foreground">
              Do not build here: these sectors make more than the market takes.
            </p>
            <SectorLinks corpId={corpId} items={levers.oversupplied} suffix="sold" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">
            Techs cut labour and inputs or raise output on your plants, and each shows what it is
            worth per turn.
          </span>
          <SmallButton onClick={() => onTabChange("tech")}>Open Tech</SmallButton>
        </div>
        <p className="text-muted">
          To take plants from a rival, open their sector page and use Split rival plants. Your
          marketing strength sets how many you can take, your R&amp;D sets the odds.
        </p>
      </div>
    </DenseSection>
  );
}
