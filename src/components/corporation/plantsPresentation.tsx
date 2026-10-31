"use client";

/**
 * Shared plants-tier presentation.
 *
 * Under `marketSystemMode >= "plants"` a sector is a set of PLANTS: capacity is
 * the thing you buy, output is the thing you make, and revenue is DERIVED from
 * the two. Six surfaces have to say that in the same vocabulary — the sectors
 * table, the CEO build summary, the national CEO panel, the expand-market
 * flow, the untapped-market card and the sector page. The formatting and the
 * colour bands live here so they cannot drift apart, which is what happened to
 * the money units before `moneyTimescale` centralised them.
 *
 * Unit convention, stated once: capacity, produced and sold units are all
 * OUTPUT UNITS PER DAY, the same 24-turn financial day `revenue` is stored on.
 * They never need rescaling against each other or against a money figure at
 * the same period.
 */

import { type FillRateBand } from "@/lib/corporations/financialFogOfWar";
import { FILL_BAND_TEXT, fillBandSentence, fillBandShort, formatFillPercent } from "./fillBand";

export { FILL_BAND_TEXT, fillBandSentence, fillBandShort, formatFillPercent } from "./fillBand";
import type { BuildQueueSummary } from "@/lib/corporations/sectorBuildQueue";
import type { OperatingSectorType } from "@/lib/constants/corporationsClient";
import {
  capitalizeFacility,
  facilityPlural,
  facilitySingular,
} from "@/lib/constants/facilityVocabulary";
import {
  plantSizeForSector,
  sectorPlantCount,
  type PlantReadingSector,
  type PlantSizingSector,
} from "@/lib/constants/facilityQuantum";

export { sectorPlantCount, type PlantReadingSector } from "@/lib/constants/facilityQuantum";
import {
  FREIGHT_CLASS_LABELS,
  freightClassAction,
  freightClassExplanation,
  type FreightClass,
} from "@/lib/logistics/freightClass";

/** Canonical noun for capacity across every plants surface. */
export const CAPACITY_UNIT_LABEL = "units/day";

/**
 * Format a unit count compactly. Capacity spans several orders of magnitude
 * across sector types, and a table of raw `1,284,003` numbers is unreadable at
 * a glance, so anything four digits or more collapses to k/M/B — the same
 * shape the money formatter uses, so the two columns scan alike.
 */
export function formatUnits(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(0)}k`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toLocaleString("en-US");
}

/**
 * Fill-rate chip.
 *
 * Shows the exact percentage when the viewer has it (owner and insiders), and
 * the band word when they do not (rivals — the exact rate is attack-targeting
 * intel, see financialFogOfWar). Both render the same chip in the same colour,
 * so a rival can see the shape of the market without being handed the number.
 */
export function FillChip({
  fill,
  band,
  className = "",
}: {
  fill: number | null | undefined;
  band: FillRateBand | null | undefined;
  className?: string;
}) {
  if (band == null) {
    return (
      <span
        className={`text-xs tabular-nums text-muted ${className}`.trim()}
        title="This sector produced nothing last turn, so it has no fill rate."
      >
        n/a
      </span>
    );
  }
  const exact = fill != null && Number.isFinite(fill);
  return (
    <span
      className={`font-mono text-[13px] font-medium tabular-nums ${FILL_BAND_TEXT[band]} ${className}`.trim()}
      title={
        exact
          ? `${fillBandSentence(band)}. Fill rate is the share of what this sector produced that it actually sold.`
          : `${fillBandSentence(band)}. You do not have access to this corporation's exact fill rate.`
      }
    >
      {exact ? formatFillPercent(fill) : fillBandShort(band)}
    </span>
  );
}

/**
 * Below this share, a delivery-limited fraction is rounding and gets no
 * qualifier. One threshold so the row, the sector page and the tooltips all
 * start saying "freight" at the same point.
 */
export const DELIVERY_LIMITED_MIN_SHARE = 0.01;

/**
 * Marker for a sector whose missing fill is a DELIVERY failure.
 *
 * The fill chip on its own reads as demand every time: a player sees 60% and
 * cuts output, when the fix is freight out of the state. This is the one piece
 * of the row that distinguishes "nobody wanted it" from "it could not get
 * there", which are opposite instructions about what to do next.
 */
export function DeliveryLimitedPill({
  fraction,
  freightClass,
  className = "",
}: {
  fraction: number | null | undefined;
  freightClass?: FreightClass | null;
  className?: string;
}) {
  if (fraction == null || !Number.isFinite(fraction) || fraction <= DELIVERY_LIMITED_MIN_SHARE) {
    return null;
  }
  const label = freightClass ? FREIGHT_CLASS_LABELS[freightClass] : "Delivery";
  const explanation = freightClass
    ? freightClassExplanation(freightClass)
    : "This output could not reach buyers outside its state.";
  const action = freightClass
    ? freightClassAction(freightClass)
    : "Add freight capacity out of this state, or site capacity nearer buyers.";
  // Ticket #1180: the pill used to render the bare class name, so "BULK
  // FREIGHT" sat in warning colours next to a healthy fill chip and read as a
  // category label, or worse, as "this sector needs freight". A player took it
  // for a freight-shortage light and built two logistics sectors into a glutted
  // market. Same lesson as the build-queue pill in #1141: the number and the
  // verb go on the face, because the tooltip does not exist on touch at all.
  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-center justify-end gap-x-1 text-right text-[11px] font-medium leading-tight text-warning ${className}`.trim()}
      title={`${label} limited. ${formatFillPercent(fraction)} of this sector's output could not reach buyers outside this state. ${explanation} ${action} Cutting production is not the fix.`}
    >
      {label}
      <span className="font-mono tabular-nums">{formatFillPercent(fraction)}</span>
      <span className="font-normal">stuck</span>
    </span>
  );
}

/**
 * Small badge for capacity that is paid for and on its way.
 *
 * Mid-build is the state the old growth-slider UI had no way to show at all:
 * money had left the corporation and nothing on screen accounted for it. The
 * badge names both halves — how much, and how long.
 */
/**
 * The one sentence that explains the build-queue pill, shared by its tooltip and
 * its accessible name so a screen reader and a mouse user get the same words.
 */
export function buildQueueBadgeLabel(queue: BuildQueueSummary): string {
  const turns = queue.turnsRemaining;
  return (
    `${Math.round(queue.unitsOrdered).toLocaleString("en-US")} ${CAPACITY_UNIT_LABEL} of capacity is paid for and under construction` +
    (queue.orders > 1 ? ` across ${queue.orders} orders` : "") +
    (turns != null ? `. The next order lands in ${turns} turn${turns === 1 ? "" : "s"}.` : ".")
  );
}

/** Plants (or fractions of a plant) for a count of capacity units. */
function formatPlantCount(plants: number): string {
  if (plants >= 10) return Math.round(plants).toLocaleString("en-US");
  const rounded = Math.round(plants * 10) / 10;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/**
 * Build progress in plants: how many are on order, how many already arrived,
 * and (for smooth orders) how many land each turn. `plantUnits` is the
 * sector's fixed plant size in capacity units.
 */
export function buildProgressInPlants(queue: BuildQueueSummary, plantUnits: number) {
  const size = Math.max(1, plantUnits);
  const ordered = queue.unitsOrdered / size;
  const remaining = queue.unitsRemaining / size;
  return {
    ordered,
    remaining,
    delivered: Math.max(0, ordered - remaining),
    perTurn: queue.unitsPerTurn > 0 ? queue.unitsPerTurn / size : null,
  };
}

export function buildProgressLabel(
  queue: BuildQueueSummary,
  plantUnits: number,
  singular: string,
  plural: string
): string {
  const p = buildProgressInPlants(queue, plantUnits);
  const noun = p.ordered === 1 ? singular : plural;
  const done =
    queue.lastOnlineTurn != null ? ` Last one is done on turn ${queue.lastOnlineTurn}.` : "";
  const rate =
    p.perTurn != null
      ? ` About ${formatPlantCount(p.perTurn)} ${p.perTurn === 1 ? singular : plural} arrive each turn.`
      : "";
  return `${formatPlantCount(p.delivered)} of ${formatPlantCount(p.ordered)} ${noun} built so far, ${formatPlantCount(p.remaining)} still under construction.${rate}${done} Capacity is added a slice at a time, so the capacity figure rises each turn until then.`;
}

export function BuildQueueBadge({
  queue,
  className = "",
  plantUnits,
  plantSingular = "plant",
  plantPlural = "plants",
}: {
  queue: BuildQueueSummary | null | undefined;
  className?: string;
  /** Capacity units in one plant. When given, the badge counts plants, not units. */
  plantUnits?: number;
  plantSingular?: string;
  plantPlural?: string;
}) {
  if (!queue || queue.unitsOrdered <= 0) return null;
  const turns = queue.turnsRemaining;
  if (plantUnits != null) {
    const p = buildProgressInPlants(queue, plantUnits);
    const label = buildProgressLabel(queue, plantUnits, plantSingular, plantPlural);
    return (
      <span
        className={`flex flex-col text-[11px] font-medium tabular-nums text-primary ${className}`.trim()}
        aria-label={label}
        title={label}
      >
        <span>
          +{formatPlantCount(p.remaining)} building
          {queue.lastOnlineTurn != null && (
            <span className="font-normal opacity-80"> · done turn {queue.lastOnlineTurn}</span>
          )}
        </span>
        {p.perTurn != null && (
          <span className="font-normal opacity-80">
            {formatPlantCount(p.delivered)} of {formatPlantCount(p.ordered)} in · about{" "}
            {formatPlantCount(p.perTurn)} a turn
          </span>
        )}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-primary ${className}`.trim()}
      aria-label={buildQueueBadgeLabel(queue)}
      title={buildQueueBadgeLabel(queue)}
    >
      +{formatUnits(queue.unitsOrdered)}
      {/* Ticket #1141: a player read this pill as part of the freight badge next
          to it and asked what freight meant in sectors. The number and the bare
          "38T" said nothing on their own, and the explanation was hover-only, so
          it did not exist at all on touch. Name the thing on the face of it. */}
      <span className="font-normal opacity-80">building</span>
      {turns != null && (
        <span className="font-normal opacity-80">
          {turns}
          {"T"}
        </span>
      )}
    </span>
  );
}

/**
 * Share of capacity actually used last turn (produced over capacity). Fill only
 * says how much of the OUTPUT sold, so a plant making a sliver of its capacity
 * can still read 100% fill. Returns null when it cannot be known.
 */
export function capacityUsedFraction(
  producedUnits: number | null | undefined,
  capacityUnits: number | null | undefined
): number | null {
  if (producedUnits == null || capacityUnits == null) return null;
  if (!Number.isFinite(producedUnits) || !Number.isFinite(capacityUnits) || capacityUnits <= 0) {
    return null;
  }
  return Math.max(0, Math.min(1, producedUnits / capacityUnits));
}

/** "14 plants", "1 farm", or "No stores yet" for a sector with none. */
export function plantCountLabel(count: number, sectorType: string | null | undefined): string {
  if (count <= 0) return `No ${facilityPlural(sectorType)} yet`;
  const noun = count === 1 ? facilitySingular(sectorType) : facilityPlural(sectorType);
  return `${count.toLocaleString("en-US")} ${noun}`;
}

/** Tooltip for a plant count: the plants, then what they can make in units. */
export function plantCountTitle(sector: PlantReadingSector): string {
  const count = sectorPlantCount(sector);
  if (count <= 0) {
    return `No ${facilityPlural(sector.sectorType)} built yet. Anything under construction is shown below.`;
  }
  const size = plantSizeForSector(sector);
  return `${plantCountLabel(count, sector.sectorType)}. At full run they make about ${formatUnits(sector.capacityUnits)} units of output a day, about ${formatUnits(size)} each.`;
}

/**
 * The plant count a table cell leads with. Raw capacity units are an engine
 * measure, so they live in the tooltip only.
 */
export function PlantCount({
  sector,
  className = "",
}: {
  sector: PlantReadingSector;
  className?: string;
}) {
  const count = sectorPlantCount(sector);
  return (
    <span
      className={`tabular-nums ${count <= 0 ? "text-muted" : ""} ${className}`.trim()}
      title={plantCountTitle(sector)}
    >
      {plantCountLabel(count, sector.sectorType)}
    </span>
  );
}

/**
 * Plants' worth of capacity, for "room to build" figures: how many new plants
 * of this sector's size the unmet demand would keep busy. Floored, because a
 * build is whole plants; a sliver under one plant reads as under one.
 */
export function plantsOfRoom(units: number | null | undefined, sector: PlantSizingSector): number {
  if (units == null || !Number.isFinite(units) || units <= 0) return 0;
  return Math.floor(units / Math.max(1, plantSizeForSector(sector)));
}

/** "about 3 plants", "about 1 store", "under 1 store", "none right now". */
export function roomInPlantsLabel(
  units: number | null | undefined,
  sector: PlantSizingSector
): string {
  if (units == null || !Number.isFinite(units) || units <= 0) return "none right now";
  const plants = plantsOfRoom(units, sector);
  if (plants < 1) return `under 1 ${facilitySingular(sector.sectorType)}`;
  const noun =
    plants === 1 ? facilitySingular(sector.sectorType) : facilityPlural(sector.sectorType);
  return `about ${plants.toLocaleString("en-US")} ${noun}`;
}

/** Column heading and its tooltip for the one running and sold reading. */
export const RUNNING_SOLD_HEADING = "Running / sold";
export const RUNNING_SOLD_HEADING_TITLE =
  "Running: how much of what these plants could make they actually made last turn. Sold: how much of what they made found buyers.";

/**
 * The one reading of how a sector's plants did last turn, used by every table:
 * "Running 55%" (made over what the plants could make) and "Sold 45%" (sold
 * over made). Each figure carries its own label, because two bare percentages
 * side by side read as one number over another.
 *
 * `fill` is null and `band` set for a viewer without the exact rate (rivals):
 * the sold line then shows the band word, as the fill chip does.
 */
export function RunningSoldReading({
  produced,
  capacity,
  fill,
  band,
  plantCount,
  className = "",
}: {
  produced: number | null | undefined;
  capacity: number | null | undefined;
  fill: number | null | undefined;
  band: FillRateBand | null | undefined;
  /** Zero reads as "not running yet" instead of two empty figures. */
  plantCount?: number | null;
  className?: string;
}) {
  if (plantCount === 0) {
    return (
      <span
        className={`text-[11px] text-muted ${className}`.trim()}
        title="No plants are built yet, so nothing was made or sold."
      >
        Not running yet
      </span>
    );
  }
  const used = capacityUsedFraction(produced, capacity);
  const exactFill = fill != null && Number.isFinite(fill);
  return (
    <span className={`inline-flex flex-col text-[11px] leading-tight ${className}`.trim()}>
      {used != null && (
        <span
          className="tabular-nums"
          title="Share of what these plants could make that they actually made last turn. Low running means buyers, staff or inputs are holding them back."
        >
          <span className="text-muted">Running </span>
          <span
            className={`font-mono font-medium ${used < 0.5 ? "text-warning" : "text-foreground"}`}
          >
            {Math.round(used * 100)}%
          </span>
        </span>
      )}
      <span
        className="tabular-nums"
        title={
          band == null
            ? "Nothing was made last turn, so nothing could be sold."
            : exactFill
              ? `${fillBandSentence(band)}. Share of what these plants made last turn that found buyers.`
              : `${fillBandSentence(band)}. You do not have access to this corporation's exact sales.`
        }
      >
        <span className="text-muted">Sold </span>
        {band == null ? (
          <span className="text-muted">n/a</span>
        ) : (
          <span className={`font-mono font-medium ${FILL_BAND_TEXT[band]}`}>
            {exactFill ? formatFillPercent(fill) : fillBandShort(band)}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Pill marking a cold-stowed sector. Pairs with row dimming.
 *
 * `sectorType` is optional because a few callers render the pill in an
 * aggregate list with no single type; those get "facilities".
 */
export function MothballedPill({
  className = "",
  sectorType,
}: {
  className?: string;
  sectorType?: OperatingSectorType;
}) {
  const sites = facilityPlural(sectorType);
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium text-muted ${className}`.trim()}
      title={`Mothballed. ${capitalizeFacility(sites)} here produce nothing and pay reduced upkeep. Reactivating is free.`}
    >
      Mothballed
    </span>
  );
}

/** Deep link to a sector's build dialog. One convention, one place. */
export function sectorBuildUrl(corpId: string, sectorId: string): string {
  return `/corporation/${corpId}/sector/${sectorId}?build=1`;
}

/** The sector page with the rival plant-split planner open, once its quote loads. */
export function sectorSplitUrl(corpId: string, sectorId: string): string {
  return `/corporation/${corpId}/sector/${sectorId}?split=1`;
}
