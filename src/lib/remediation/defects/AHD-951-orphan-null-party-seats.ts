// AHD-951: orphan `party:null seatsHeld>0` electedOfficials blocs.
//
// When a multi-seat winner (commons/bundestag/seanad) moved from a previous
// office to a new seat, generalResolution vacated the OLD bloc by nulling the
// holder identity (party/characterId/nppId) but left `seatsHeld` intact. The
// seat tallies skip null-party rows, so those seats silently vanished from the
// party — the Conservatives' 14 NEE UK-commons seats reported as "vacant".
//
// Half A (code): $unset seatsHeld on vacate, stopping new orphans.
// Half B (this heal): delete the existing phantom blocs. For most chambers
// vacancy is row ABSENCE — true vacancies delete rows rather than leaving null
// placeholders — so deletion is the correct repair and the next election
// re-contests the seats. UK Commons is the exception (#856/#860): a
// holder-less `commons` row is the durable seat record that a live
// `ukCommonsVacancies` doc anchors until a by-election fills it, so those rows
// are excluded here.
//
// Ported from scripts/heal-orphan-null-party-seats.ts, which stays as the
// standalone escape hatch. The office-type allowlist is deliberate: a
// null-party row on any OTHER office type may be a legitimate non-party seat,
// so those are reported and left alone rather than swept up.

import type { Db, ObjectId } from "mongodb";
import { getUkCommonsVacanciesCollection } from "@/lib/db/collections/ukByElection";
import type { Defect, DetectResult, HealPlan, HealResult, VerifyResult } from "../types";

/** Office types where a null-party bloc can only be the vacate bug. */
const HEALED_OFFICE_TYPES = ["commons", "snap_commons", "bundestag", "snap_bundestag", "seanad"];

/** Non-terminal UK Commons vacancies: a live doc anchors its holder-less row. */
const LIVE_VACANCY_STATUSES = ["open", "scheduled"] as const;

/** No holder of any kind, yet still claiming seats. */
const ORPHAN_SHAPE = {
  party: null,
  characterId: null,
  nppId: null,
  seatsHeld: { $gt: 0 },
} as const;

const HEAL_FILTER = { ...ORPHAN_SHAPE, officeType: { $in: HEALED_OFFICE_TYPES } };

interface OrphanRow {
  _id: ObjectId;
  countryId?: string;
  officeType?: string;
  state?: string;
  seatsHeld?: number;
}

interface OrphanScan {
  /** Rows the heal may delete. */
  orphans: OrphanRow[];
  /** Holder-less commons rows kept because a live vacancy doc anchors them. */
  anchored: number;
}

/**
 * A holder-less `commons` row with a live `ukCommonsVacancies` doc is not an
 * orphan: the row is the seat record the scheduled by-election fills and
 * deletes on resolution, and removing it would orphan the vacancy.
 */
async function listVacancyAnchoredIds(db: Db, ids: ObjectId[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const docs = await getUkCommonsVacanciesCollection(db)
    .find(
      { officialId: { $in: ids }, status: { $in: [...LIVE_VACANCY_STATUSES] } },
      { projection: { officialId: 1 } }
    )
    .toArray();
  return new Set(docs.map((doc) => String(doc.officialId)));
}

async function scanOrphans(db: Db): Promise<OrphanScan> {
  const rows = await db
    .collection<OrphanRow>("electedOfficials")
    .find(HEAL_FILTER, { projection: { countryId: 1, officeType: 1, state: 1, seatsHeld: 1 } })
    .toArray();
  const anchoredIds = await listVacancyAnchoredIds(
    db,
    rows.map((row) => row._id)
  );
  const orphans = rows.filter((row) => !anchoredIds.has(String(row._id)));
  return { orphans, anchored: rows.length - orphans.length };
}

async function countFlagged(db: Db): Promise<number> {
  return db
    .collection("electedOfficials")
    .countDocuments({ ...ORPHAN_SHAPE, officeType: { $nin: HEALED_OFFICE_TYPES } });
}

async function detect(db: Db): Promise<DetectResult> {
  const { orphans, anchored } = await scanOrphans(db);
  const flagged = await countFlagged(db);
  const phantomSeats = orphans.reduce((sum, row) => sum + (row.seatsHeld ?? 0), 0);

  const notes = [`${phantomSeats} phantom seats across ${orphans.length} bloc(s)`];
  if (anchored > 0) {
    notes.push(
      `${anchored} holder-less commons row(s) are live UK by-election vacancy anchors and are NOT touched`
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
    touched: [{ collection: "electedOfficials", ids: orphans.map((row) => String(row._id)) }],
    moneyDelta: 0,
    summary: `delete ${orphans.length} orphan null-party bloc(s) holding ${phantomSeats} phantom seat(s)`,
    notes: orphans
      .slice(0, 20)
      .map((row) => `${row.countryId}/${row.officeType}/${row.state} seats=${row.seatsHeld}`),
  };
}

async function apply(db: Db, healPlan: HealPlan): Promise<HealResult> {
  const ids = healPlan.touched.find((t) => t.collection === "electedOfficials")?.ids ?? [];
  // Delete by the SHAPE filter restricted to the approved ids, not by id alone.
  // If a row stopped being an orphan — or became a live by-election vacancy
  // anchor — between plan and apply, it survives.
  const { orphans } = await scanOrphans(db);
  const approved = new Set(ids);
  const toDelete = orphans.map((row) => row._id).filter((id) => approved.has(String(id)));

  const res = await db
    .collection("electedOfficials")
    .deleteMany({ ...HEAL_FILTER, _id: { $in: toDelete } } as Record<string, unknown>);

  return {
    documentsScanned: orphans.length,
    documentsDeleted: res.deletedCount,
    notes: [`deleted ${res.deletedCount} of ${ids.length} approved orphan bloc(s)`],
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const remaining = (await scanOrphans(db)).orphans.length;
  const flagged = await countFlagged(db);
  return {
    ok: remaining === 0,
    remaining,
    notes: [
      remaining === 0
        ? "no orphan null-party blocs remain on healed office types"
        : `${remaining} orphan bloc(s) still present`,
      `${flagged} null-party bloc(s) on other office types remain, by design`,
    ],
  };
}

export const defect: Defect = {
  id: "AHD-951",
  title: "Orphan null-party electedOfficials blocs hold phantom seats",
  severity: "P1",
  // b6e272979 "clear seatsHeld when vacating multi-seat blocs to stop
  // party:null orphans" (PR #3135). generalResolution now $unsets seatsHeld on
  // the vacated bloc instead of leaving the count behind. The gate refuses to
  // heal any env whose deployed build predates it, because that build would
  // recreate the orphans on the next resolution.
  codeFix: {
    issue: 951,
    pr: 3135,
    mergedTo: "master",
    // The fix (b6e2729, 2026-07-12) predates this repository's public history,
    // which begins at the "Initial public release" snapshot; the snapshot
    // carries the fix in full, so it is the commit the code gate can find.
    requiredCommit: "8972afb65990046691e36f44f88f94b0a3c0a4cf",
  },
  // Checked 2026-08-08. The roster seeder allocates seatsHeld proportionally
  // across default parties, so every seeded row carries a party, and "vacant"
  // seed rosters leave the chamber empty rather than writing a holder-less row
  // (priors mode seeds no incumbents at all). A seed therefore cannot emit
  // `party:null seatsHeld>0`; at runtime that shape only comes from the vacate
  // path or, for UK Commons, from a by-election vacancy anchor.
  seedFix: {
    status: "not-needed",
    files: ["src/lib/admin/seed/seedEconTierRosters.ts", "src/lib/admin/seed/seedUK.ts"],
    note: "seeded rosters always stamp a party; a holder-less commons row is only the by-election vacancy anchor",
  },
  envs: ["dev", "sandbox", "prod"],
  idempotent: true,
  guards: ["turn-lock-free", "max-affected:500"],
  detect,
  plan,
  apply,
  verify,
};
