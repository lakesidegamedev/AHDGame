"use client";

import Link from "next/link";
import type { CorpTabId, SectorDetail } from "./CorporationPageTypes";
import { DenseSection, SmallButton } from "./dense/DenseKit";
import { sectorBuildUrl } from "./plantsPresentation";
import {
  OVERSUPPLIED_UNSOLD,
  outputPlacement,
  placementSentence,
  type OutputPlacement,
} from "@/lib/corporations/rules/outputPlacement";

/** Unsold share at or below this means the plants place (almost) everything they make. */
const SOLD_OUT_UNSOLD = 0.02;
/** Undelivered share above this is worth flagging as a freight problem. */
const DELIVERY_LIMIT_FLAG = 0.05;

export interface GrowthLeverSector {
  id: string;
  label: string;
  /** Whole-number percent. */
  value: number;
  /** Sold to buyers, sent to own sites and unsold, in words. */
  detail?: string;
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
  // Output sent to the company's own sites is used, so it is never unsold.
  const placement = (s: SectorDetail): OutputPlacement =>
    outputPlacement({ sold: s.fillRate, ownSites: s.ownSiteShare }) ?? {
      sold: 0,
      ownSites: 0,
      unsold: 1,
    };
  const pick = (
    test: (s: SectorDetail) => boolean,
    value: (s: SectorDetail) => number
  ): GrowthLeverSector[] =>
    running
      .filter(test)
      .slice(0, 3)
      .map((s) => ({
        id: s._id,
        label: sectorLabel(s),
        value: Math.round(value(s) * 100),
        detail: placementSentence(placement(s)),
      }));
  const delivery = (s: SectorDetail) => s.deliveryLimitedFraction ?? 0;
  return {
    soldOut: pick(
      (s) => placement(s).unsold <= SOLD_OUT_UNSOLD,
      (s) => 1 - placement(s).unsold
    ),
    deliveryLimited: pick((s) => delivery(s) > DELIVERY_LIMIT_FLAG, delivery),
    oversupplied: pick(
      (s) => placement(s).unsold > OVERSUPPLIED_UNSOLD && delivery(s) <= DELIVERY_LIMIT_FLAG,
      (s) => placement(s).unsold
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
            {item.detail ?? `${item.value}% ${suffix}`}
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
      <div className="space-y-3 text-body-sm leading-relaxed">
        <p className="text-muted">
          Sectors do not grow on their own. Revenue rises when you add plants that can sell their
          output, cut what each plant costs to run, or take plants from rivals.
        </p>
        {levers.soldOut.length > 0 && (
          <div>
            <p className="font-medium text-foreground">
              Build here: everything these sectors make is sold or used by your own sites.
            </p>
            <SectorLinks corpId={corpId} items={levers.soldOut} suffix="placed" build />
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
              Do not build here: outside buyers leave part of what these sectors make unsold.
            </p>
            <SectorLinks corpId={corpId} items={levers.oversupplied} suffix="unsold" />
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
          marketing strength sets how many you can take and the odds.
        </p>
      </div>
    </DenseSection>
  );
}
