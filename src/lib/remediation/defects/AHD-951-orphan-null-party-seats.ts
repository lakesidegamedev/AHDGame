// AHD-951: orphan `party:null seatsHeld>0` electedOfficials blocs.
//
// When a multi-seat winner moved from a previous office to a new seat,
// generalResolution vacated the OLD bloc by nulling the holder identity but
// left `seatsHeld` intact. Seat tallies skip null-party rows, so those seats
// silently vanished from the party.
//
// Half A (code): $unset seatsHeld on vacate, stopping new orphans.
// Half B (this heal): delete the existing phantom blocs. Vacancy is row
// ABSENCE in this codebase, so deletion is the correct repair and the next
// election re-contests the seats.
//
// UK Commons is an exception: a mid-term vacancy is a durable doc in
// `ukCommonsVacancies` whose `officialId` anchors a tombstoned bloc row
// (holder fields cleared, seatsHeld intact, because the row sizes the
// by-election) and `special_commons` seats winners in new rows. Deleting an
// anchored row strands a live by-election, so every row a vacancy points at
// is excluded here, whatever its status. The anchor set is re-read inside
// apply(), so a row that gains a vacancy after planning is never deleted.
//
// The office-type allowlist is deliberate: a null-party row on any OTHER
// office type may be a legitimate non-party seat, so those are reported and
// left alone.

import type { Db } from "mongodb";
import { MULTI_SEAT_BLOC_OFFICE_TYPES } from "@/lib/elections/vacatedBlocSeats";
import type { Defect, DetectResult, HealPlan, HealResult, VerifyResult } from "../types";

/** Office types where a null-party bloc can only be the vacate bug. */
const HEALED_OFFICE_TYPES: string[] = [...MULTI_SEAT_BLOC_OFFICE_TYPES];

/** No holder of any kind, yet still claiming seats. */
const ORPHAN_SHAPE = {
  party: null,
  characterId: null,
  nppId: null,
  seatsHeld: { $gt: 0 },
} as const;

const HEAL_FILTER = { ...ORPHAN_SHAPE, officeType: { $in: HEALED_OFFICE_TYPES } };

const OFFICIALS = "electedOfficials";
const VACANCIES = "ukCommonsVacancies";

interface OrphanRow {
  _id: unknown;
  countryId?: string;
  officeType?: string;
  state?: string;
  seatsHeld?: number;
}

interface OrphanScan {
  /** Blocs this defect owns: shape-matched and not the anchor of a vacancy. */
  orphans: OrphanRow[];
  /** Shape-matched blocs left alone because a UK Commons vacancy anchors them. */
  anchored: number;
}

/**
 * Rows a UK Commons vacancy points at. They are live tombstones, not orphans:
 * the vacancy shell and the additive by-election resolver keep the anchor.
 */
async function findVacancyAnchoredIds(db: Db, ids: unknown[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const docs = await db
    .collection<{ officialId?: unknown }>(VACANCIES)
    .find({ officialId: { $in: ids } }, { projection: { officialId: 1 } })
    .toArray();
  return new Set(docs.map((doc) => String(doc.officialId)));
}

async function scanOrphans(db: Db): Promise<OrphanScan> {
  const candidates = await db
    .collection<OrphanRow>(OFFICIALS)
    .find(HEAL_FILTER, { projection: { countryId: 1, officeType: 1, state: 1, seatsHeld: 1 } })
    .toArray();
  const anchoredIds = await findVacancyAnchoredIds(
    db,
    candidates.map((row) => row._id)
  );
  const orphans = candidates.filter((row) => !anchoredIds.has(String(row._id)));
  return { orphans, anchored: candidates.length - orphans.length };
}

async function countFlagged(db: Db): Promise<number> {
  return db
    .collection(OFFICIALS)
    .countDocuments({ ...ORPHAN_SHAPE, officeType: { $nin: HEALED_OFFICE_TYPES } });
}

async function detect(db: Db): Promise<DetectResult> {
  const { orphans, anchored } = await scanOrphans(db);
  const flagged = await countFlagged(db);
  const phantomSeats = orphans.reduce((sum, row) => sum + (row.seatsHeld ?? 0), 0);

  const notes = [`${phantomSeats} phantom seats across ${orphans.length} bloc(s)`];
  if (anchored > 0) {
    notes.push(
      `${anchored} shape-matched bloc(s) are UK Commons vacancy anchors and are NOT touched — a by-election still owns those seats`
    );
  }
  if (flagged > 0) {
    notes.push(
      `${flagged} null-party bloc(s) on OTHER office types are flagged but NOT touched — review against the seed before deleting, they may be legitimate non-party seats`
    );
  }

  return {
    affected: orphans.length,
    sample: orphans.slice(0, 10).map((row) => ({
      id: String(row._id),
      countryId: row.countryId,
      officeType: row.officeType,
      state: row.state,
      seatsHeld: row.seatsHeld,
    })),
    notes,
  };
}

async function plan(db: Db): Promise<HealPlan> {
  const { orphans } = await scanOrphans(db);
  const phantomSeats = orphans.reduce((sum, row) => sum + (row.seatsHeld ?? 0), 0);

  return {
    affected: orphans.length,
    touched: [{ collection: OFFICIALS, ids: orphans.map((row) => String(row._id)) }],
    moneyDelta: 0,
    summary: `delete ${orphans.length} orphan null-party bloc(s) holding ${phantomSeats} phantom seat(s)`,
    notes: orphans
      .slice(0, 20)
      .map((row) => `${row.countryId}/${row.officeType}/${row.state} seats=${row.seatsHeld}`),
  };
}

async function apply(db: Db, healPlan: HealPlan): Promise<HealResult> {
  const ids = healPlan.touched.find((t) => t.collection === OFFICIALS)?.ids ?? [];
  // Rescan rather than trusting the plan: delete by the SHAPE filter restricted
  // to the approved ids, so a row that stopped being an orphan — or became a
  // vacancy anchor — between plan and apply survives.
  const { orphans } = await scanOrphans(db);
  const approved = new Set(ids);
  const toDelete = orphans.map((row) => row._id).filter((id) => approved.has(String(id)));

  const res = await db
    .collection(OFFICIALS)
    .deleteMany({ ...HEAL_FILTER, _id: { $in: toDelete } } as Record<string, unknown>);

  return {
    documentsScanned: orphans.length,
    documentsDeleted: res.deletedCount,
    notes: [`deleted ${res.deletedCount} of ${ids.length} approved orphan bloc(s)`],
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const { orphans, anchored } = await scanOrphans(db);
  const remaining = orphans.length;
  const flagged = await countFlagged(db);
  const notes = [
    remaining === 0
      ? "no orphan null-party blocs remain on healed office types"
      : `${remaining} orphan bloc(s) still present`,
  ];
  if (anchored > 0) {
    notes.push(`${anchored} UK Commons vacancy anchor(s) remain, by design`);
  }
  notes.push(`${flagged} null-party bloc(s) on other office types remain, by design`);
  return {
    ok: remaining === 0,
    remaining,
    notes,
  };
}

export const defect: Defect = {
  id: "AHD-951",
  title: "Orphan null-party electedOfficials blocs hold phantom seats",
  severity: "P1",
  // The gate refuses to heal envs deployed before the seatsHeld-unset fix,
  // because those builds recreate the party:null orphans on next resolution.
  codeFix: {
    issue: 951,
    pr: 3135,
    mergedTo: "master",
    // The fix predates this repository's public history; the "Initial public
    // release" snapshot carries it, so the gate pins the snapshot.
    requiredCommit: "8972afb65990046691e36f44f88f94b0a3c0a4cf",
  },
  // Seeders stamp every row with a party; vacancy is row absence, not a null-party row.
  // `party:null seatsHeld>0` only comes from the runtime vacate path.
  seedFix: {
    status: "not-needed",
    files: ["src/lib/admin/seed/seedEconTierRosters.ts", "src/lib/admin/seed/seedUK.ts"],
    note: "seeded rosters always stamp a party; vacancy is row absence, not a null-party row",
  },
  envs: ["dev", "sandbox", "prod"],
  idempotent: true,
  guards: ["turn-lock-free", "max-affected:500"],
  detect,
  plan,
  apply,
  verify,
};
