import type { AnyBulkWriteOperation } from "mongodb";
import type { CountryGameState, Election, ElectionStatus } from "@/lib/db/types";
import { getJpSangiinSeats, getJpShugiinSeats } from "../data/jpSeats";
import { getElectionMethod } from "@/lib/elections/electionMethod";
import { defineChamberSpec, type ChamberHooks } from "@/lib/turn/perpetualElections/chamberSpec";
import {
  japanShugiinFrozenRegionCapacity,
  japanShugiinRulesForRegion,
} from "../rules/shugiinElectoralLaw";

type ShugiinMandate = CountryGameState["jpShugiinElectoralMandate"];

const LIVE: ElectionStatus[] = ["active", "upcoming"];

/** Live races stay on the era's allocator, except mixed-reform races, which own their counter. */
function healAllocationMethod(
  live: readonly Election[],
  preset: string | undefined,
  now: Date
): AnyBulkWriteOperation<Election>[] {
  const eraMethod = getElectionMethod("JP", "shugiin", preset);
  if (!eraMethod) return [];
  return live
    .filter(
      (e) =>
        e.japanShugiinRules?.ruleVersion !== "mixed-1994-v1" && e.allocationMethod !== eraMethod
    )
    .map((e): AnyBulkWriteOperation<Election> => ({
      updateOne: {
        filter: {
          _id: e._id,
          ...(e.allocationMethod === undefined
            ? { allocationMethod: { $exists: false } }
            : { allocationMethod: e.allocationMethod }),
          status: { $in: LIVE },
          "japanShugiinRules.ruleVersion": { $ne: "mixed-1994-v1" },
        },
        update: { $set: { allocationMethod: eraMethod, updatedAt: now } },
      },
    }));
}

/** Live races take the capacity their frozen rules (or the era map) give them. */
function healFrozenSeats(
  live: readonly Election[],
  preset: string | undefined,
  now: Date
): AnyBulkWriteOperation<Election>[] {
  const seatsByRegion = getJpShugiinSeats(preset);
  return live.flatMap((e) => {
    const authoritative = japanShugiinFrozenRegionCapacity(
      e.japanShugiinRules
        ? {
            law: e.japanShugiinRules.ruleVersion,
            totalSeats: e.japanShugiinRules.districtSeats + e.japanShugiinRules.listSeats,
            districtSeats: e.japanShugiinRules.districtSeats,
            listSeats: e.japanShugiinRules.listSeats,
          }
        : undefined,
      e.state,
      seatsByRegion[e.state]
    );
    if (typeof authoritative !== "number" || authoritative <= 0 || e.totalSeats === authoritative) {
      return [];
    }
    return [
      {
        updateOne: {
          filter: { _id: e._id, totalSeats: e.totalSeats, status: { $in: LIVE } },
          update: { $set: { totalSeats: authoritative, updatedAt: now } },
        },
      },
    ];
  });
}

const shugiinHooks: ChamberHooks = {
  healLive: (live, { preset, now }) => [
    ...healAllocationMethod(live, preset, now),
    ...healFrozenSeats(live, preset, now),
  ],
  decorate: (doc, { regionId, preset, extra }) => {
    const legacySeats = getJpShugiinSeats(preset)[regionId] ?? 0;
    const rules = japanShugiinRulesForRegion(
      preset,
      regionId,
      legacySeats,
      extra as ShugiinMandate
    );
    return {
      ...doc,
      ...(rules?.law === "mixed-1994-v1"
        ? {}
        : { allocationMethod: getElectionMethod("JP", "shugiin", preset) }),
      ...(rules
        ? {
            japanShugiinRules: {
              ruleVersion: rules.law,
              districtSeats: rules.districtSeats,
              listSeats: rules.listSeats,
              ...(rules.authorizedOnTurn != null
                ? { authorizedOnTurn: rules.authorizedOnTurn }
                : {}),
              ...(rules.reformBillId ? { reformBillId: rules.reformBillId } : {}),
            },
          }
        : {}),
      // The preset apportionment is authoritative over whatever a prior cycle carried.
      totalSeats: rules?.totalSeats ?? legacySeats,
    };
  },
};

/** Shugiin: one race per region on the era's apportionment, with the electoral law frozen at opening. */
export const JP_SHUGIIN_SPEC = defineChamberSpec({
  chamberId: "shugiin",
  countryId: "JP",
  electionType: "shugiin",
  constituencies: "regions",
  seats: {
    kind: "presetTable",
    tableFor: getJpShugiinSeats,
    enforce: "positive",
    missing: "throw",
  },
  electoralSystem: "mixed",
  cycle: { anchor: "jpShugiin", periodHours: 192 },
  gate: "always",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: false,
  byElections: "none",
  snap: "shiftsCycle",
  healLiveSeats: false,
  hooks: shugiinHooks,
});

/**
 * Sangiin: half the chamber every three years. Each class has its own anchor and
 * contests its share of a region's seats; class 1 takes the extra seat when odd.
 */
export const JP_SANGIIN_SPEC = defineChamberSpec({
  chamberId: "sangiin",
  countryId: "JP",
  electionType: "sangiin",
  constituencies: "regions",
  seats: {
    kind: "presetTable",
    tableFor: getJpSangiinSeats,
    perClass: (regionSeats, chamberClass) =>
      chamberClass === 1 ? Math.ceil(regionSeats / 2) : Math.floor(regionSeats / 2),
    enforce: "positive",
    missing: "throw",
  },
  electoralSystem: "mixed",
  cycle: { anchor: "jpSangiinClass1", periodHours: 288 },
  classes: { anchors: { 1: "jpSangiinClass1", 2: "jpSangiinClass2" } },
  gate: "always",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: true,
});

export const JP_CHAMBER_SPECS = [JP_SHUGIIN_SPEC, JP_SANGIIN_SPEC] as const;
