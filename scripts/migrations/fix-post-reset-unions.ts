/**
 * Incident response: repair organized labour after the 2026-10-29 economy-only
 * reset.
 *
 * That reset rebuilt every corporation and sector but kept the union
 * collections (they were on the keep-list as political money holders). Every
 * union in the live world predates the reset, so the whole roster belongs to
 * the deleted economy: old treasuries, organizers, leadership votes and heads,
 * many of them representing shops that no longer exist.
 *
 * This script applies the part of the reset that was missed:
 *   1. Census the unions created at or before `gameState.economyReset.completedAt`
 *      (post-reset unions are preserved).
 *   2. On --apply, back the affected rows up to JSON, then delete those unions
 *      and their organizers/votes/endorsements, clear the sectors that pointed
 *      at them, and clear every stale `Character.unionLeaderOf` cache.
 *   3. Re-run `seedUnions` so the world roster comes back vacant and the
 *      rebuilt sectors are represented again.
 *
 * Dry run by default. Both modes require the expected world epoch; apply also
 * requires the census digest, so the reviewed plan is what runs.
 *
 * Usage:
 *   npx tsx scripts/migrations/fix-post-reset-unions.ts --census \
 *     --expected-world-epoch=<id> [--output=<private-json>]
 *   npx tsx scripts/migrations/fix-post-reset-unions.ts --apply \
 *     --expected-world-epoch=<id> --approved-digest=<sha> \
 *     --backup-dir=<dir> [--approval-reference=<text>]
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ObjectId, type Db, type Document } from "mongodb";
import { seedUnions } from "@/lib/admin/seed/seedUnions";

const USAGE =
  "Usage: fix-post-reset-unions.ts --census --expected-world-epoch=<id> [--output=<file>] | " +
  "--apply --expected-world-epoch=<id> --approved-digest=<sha> --backup-dir=<dir> [--approval-reference=<text>]";

type Log = (message: string) => void;

/** Collections the reset should have cleared alongside the unions. */
const UNION_CHILD_COLLECTIONS = [
  "unionOrganizers",
  "unionLeaderVotes",
  "unionEndorsements",
] as const;

/** Bargaining rows a deleted union can still own; empty in the repaired world. */
const UNION_BARGAINING_COLLECTIONS = ["bargainingCampaigns", "collectiveAgreements"] as const;

export interface UnionCleanupPlan {
  worldEpochId: string;
  preset: string;
  currentTurn: number;
  resetCompletedAt: string;
  deleteUnionIds: string[];
  preserveUnionIds: string[];
  counts: {
    unions: number;
    organizers: number;
    leaderVotes: number;
    endorsements: number;
    bargainingCampaigns: number;
    collectiveAgreements: number;
    ratificationBallots: number;
    representedSectors: number;
    characterCaches: number;
    staleCharacterCaches: number;
  };
  planDigest: string;
}

interface CensusOptions {
  expectedWorldEpoch: string;
}

interface ApplyOptions extends CensusOptions {
  approvedDigest: string;
  backupDir: string;
  approvalReference?: string;
  log?: Log;
}

interface UnionRow {
  _id: ObjectId;
  createdAt?: Date | string | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestPlan(plan: Omit<UnionCleanupPlan, "planDigest">): string {
  return sha256(JSON.stringify(plan));
}

async function loadWorld(db: Db, expectedWorldEpoch: string) {
  const state = await db.collection("gameState").findOne(
    { _id: "current" as never },
    {
      projection: {
        worldEpochId: 1,
        preset: 1,
        currentTurn: 1,
        "economyReset.completedAt": 1,
      },
    }
  );
  if (!state) throw new Error("gameState/current is missing");
  if (state.worldEpochId !== expectedWorldEpoch)
    throw new Error(
      `World epoch changed: expected ${expectedWorldEpoch}, found ${state.worldEpochId ?? "none"}`
    );
  const completedAt = state.economyReset?.completedAt;
  if (!(completedAt instanceof Date))
    throw new Error("gameState.economyReset.completedAt is missing; no economy reset to repair");
  return {
    worldEpochId: String(state.worldEpochId),
    preset: String(state.preset ?? "1991-default"),
    currentTurn: Number(state.currentTurn ?? 0),
    completedAt,
  };
}

function hexIds(rows: UnionRow[]): string[] {
  return rows.map((row) => row._id.toHexString()).sort();
}

export async function censusPostResetUnions(
  db: Db,
  options: CensusOptions
): Promise<UnionCleanupPlan> {
  const world = await loadWorld(db, options.expectedWorldEpoch);
  const allUnions = await db
    .collection<UnionRow>("unions")
    .find({}, { projection: { _id: 1, createdAt: 1 } })
    .toArray();
  const deleteUnions = allUnions.filter(
    (union) => !union.createdAt || new Date(union.createdAt) <= world.completedAt
  );
  const preserveUnions = allUnions.filter(
    (union) => union.createdAt && new Date(union.createdAt) > world.completedAt
  );
  const deleteIds = deleteUnions.map((union) => union._id);
  const allIds = allUnions.map((union) => union._id);

  const [organizers, leaderVotes, endorsements, campaigns, agreements] = await Promise.all([
    db.collection("unionOrganizers").countDocuments({ unionId: { $in: deleteIds } }),
    db.collection("unionLeaderVotes").countDocuments({ unionId: { $in: deleteIds } }),
    db.collection("unionEndorsements").countDocuments({ unionId: { $in: deleteIds } }),
    db.collection("bargainingCampaigns").countDocuments({ unionId: { $in: deleteIds } }),
    db.collection("collectiveAgreements").countDocuments({ unionId: { $in: deleteIds } }),
  ]);
  const campaignIds = (
    await db
      .collection("bargainingCampaigns")
      .find({ unionId: { $in: deleteIds } }, { projection: { _id: 1 } })
      .toArray()
  ).map((campaign) => campaign._id);
  const ratificationBallots =
    campaignIds.length === 0
      ? 0
      : await db
          .collection("bargainingRatificationBallots")
          .countDocuments({ campaignId: { $in: campaignIds } });

  const representedSectors = await db
    .collection("corporateSectors")
    .countDocuments({ representingUnionId: { $in: deleteIds } });
  const characterCaches = await db
    .collection("characters")
    .countDocuments({ unionLeaderOf: { $in: deleteIds } });
  const staleCharacterCaches = await db
    .collection("characters")
    .countDocuments({ unionLeaderOf: { $ne: null, $nin: allIds } });

  const plan: Omit<UnionCleanupPlan, "planDigest"> = {
    worldEpochId: world.worldEpochId,
    preset: world.preset,
    currentTurn: world.currentTurn,
    resetCompletedAt: world.completedAt.toISOString(),
    deleteUnionIds: hexIds(deleteUnions),
    preserveUnionIds: hexIds(preserveUnions),
    counts: {
      unions: deleteUnions.length,
      organizers,
      leaderVotes,
      endorsements,
      bargainingCampaigns: campaigns,
      collectiveAgreements: agreements,
      ratificationBallots,
      representedSectors,
      characterCaches,
      staleCharacterCaches,
    },
  };
  return { ...plan, planDigest: digestPlan(plan) };
}

async function writeBackup(db: Db, plan: UnionCleanupPlan, backupDir: string, log: Log) {
  const dir = resolve(backupDir, new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const deleteIds = plan.deleteUnionIds.map((id) => new ObjectId(id));
  const write = (name: string, rows: Document[]) => {
    const file = resolve(dir, `${name}.json`);
    writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    log(`Backed up ${rows.length} ${name} row(s) to ${file}`);
  };

  const [
    unions,
    organizers,
    leaderVotes,
    endorsements,
    sectors,
    characters,
    campaigns,
    agreements,
  ] = await Promise.all([
    db
      .collection("unions")
      .find({ _id: { $in: deleteIds } })
      .toArray(),
    db
      .collection("unionOrganizers")
      .find({ unionId: { $in: deleteIds } })
      .toArray(),
    db
      .collection("unionLeaderVotes")
      .find({ unionId: { $in: deleteIds } })
      .toArray(),
    db
      .collection("unionEndorsements")
      .find({ unionId: { $in: deleteIds } })
      .toArray(),
    db
      .collection("corporateSectors")
      .find(
        { representingUnionId: { $in: deleteIds } },
        { projection: { _id: 1, representingUnionId: 1 } }
      )
      .toArray(),
    db
      .collection("characters")
      .find({ unionLeaderOf: { $in: deleteIds } }, { projection: { _id: 1, unionLeaderOf: 1 } })
      .toArray(),
    db
      .collection("bargainingCampaigns")
      .find({ unionId: { $in: deleteIds } })
      .toArray(),
    db
      .collection("collectiveAgreements")
      .find({ unionId: { $in: deleteIds } })
      .toArray(),
  ]);
  write("unions", unions);
  write("unionOrganizers", organizers);
  write("unionLeaderVotes", leaderVotes);
  write("unionEndorsements", endorsements);
  write("corporateSectors.pointers", sectors);
  write("characters.caches", characters);
  write("bargainingCampaigns", campaigns);
  write("collectiveAgreements", agreements);
  return dir;
}

export interface ApplyUnionCleanupResult {
  noop: boolean;
  planDigest: string;
  deletedUnions: number;
  preservedUnions: number;
  vacantUnions: number;
  backupDir: string | null;
}

export async function applyPostResetUnions(
  db: Db,
  options: ApplyOptions
): Promise<ApplyUnionCleanupResult> {
  const log = options.log ?? (() => {});
  const plan = await censusPostResetUnions(db, options);
  if (plan.planDigest !== options.approvedDigest)
    throw new Error(`Live world no longer matches the reviewed plan (${plan.planDigest})`);
  if (plan.deleteUnionIds.length === 0) {
    log("No pre-reset unions remain; nothing to do");
    return {
      noop: true,
      planDigest: plan.planDigest,
      deletedUnions: 0,
      preservedUnions: plan.preserveUnionIds.length,
      vacantUnions: await db.collection("unions").countDocuments({ ownerId: null }),
      backupDir: null,
    };
  }
  if (options.approvalReference) log(`Approval: ${options.approvalReference}`);

  const backupDir = await writeBackup(db, plan, options.backupDir, log);
  const deleteIds = plan.deleteUnionIds.map((id) => new ObjectId(id));
  const allIds = [...deleteIds, ...plan.preserveUnionIds.map((id) => new ObjectId(id))];
  const campaignIds = (
    await db
      .collection("bargainingCampaigns")
      .find({ unionId: { $in: deleteIds } }, { projection: { _id: 1 } })
      .toArray()
  ).map((campaign) => campaign._id);

  for (const name of UNION_CHILD_COLLECTIONS)
    await db.collection(name).deleteMany({ unionId: { $in: deleteIds } });
  if (campaignIds.length > 0)
    await db
      .collection("bargainingRatificationBallots")
      .deleteMany({ campaignId: { $in: campaignIds } });
  for (const name of UNION_BARGAINING_COLLECTIONS)
    await db.collection(name).deleteMany({ unionId: { $in: deleteIds } });

  await db
    .collection("corporateSectors")
    .updateMany(
      { representingUnionId: { $in: deleteIds } },
      { $set: { representingUnionId: null } }
    );
  await db
    .collection("characters")
    .updateMany({ unionLeaderOf: { $in: deleteIds } }, { $set: { unionLeaderOf: null } });
  await db
    .collection("characters")
    .updateMany({ unionLeaderOf: { $ne: null, $nin: allIds } }, { $set: { unionLeaderOf: null } });

  const deleted = await db.collection("unions").deleteMany({ _id: { $in: deleteIds } });
  await seedUnions(db, log, plan.preset, false);

  const [remaining, vacant, stillCached] = await Promise.all([
    db.collection("unions").countDocuments({}),
    db.collection("unions").countDocuments({ ownerId: null }),
    db.collection("characters").countDocuments({ unionLeaderOf: { $in: deleteIds } }),
  ]);
  if (stillCached > 0)
    throw new Error(`${stillCached} character(s) still cache leadership of a deleted union`);
  log(
    `Deleted ${deleted.deletedCount} union(s), preserved ${plan.preserveUnionIds.length}, ` +
      `roster now ${remaining} (${vacant} vacant)`
  );
  return {
    noop: false,
    planDigest: plan.planDigest,
    deletedUnions: deleted.deletedCount,
    preservedUnions: plan.preserveUnionIds.length,
    vacantUnions: vacant,
    backupDir,
  };
}

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (const arg of argv) {
    if (arg === "--census" || arg === "--apply") {
      args.set(arg.slice(2), "true");
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) throw new Error(`Expected --name=value, got ${arg}`);
    args.set(match[1], match[2]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const census = args.get("census") === "true";
  const apply = args.get("apply") === "true";
  const expectedWorldEpoch = args.get("expected-world-epoch");
  if (census === apply || !expectedWorldEpoch) throw new Error(USAGE);
  const { connectDb, closeDb } = await import("../utils/db");
  const db = await connectDb();
  try {
    if (census) {
      const plan = await censusPostResetUnions(db, { expectedWorldEpoch });
      const output = args.get("output");
      if (output) {
        const destination = resolve(output);
        mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
        writeFileSync(destination, `${JSON.stringify(plan, null, 2)}\n`, {
          mode: 0o600,
          flag: "wx",
        });
      }
      console.log(JSON.stringify(plan, null, 2));
      return;
    }
    const approvedDigest = args.get("approved-digest");
    const backupDir = args.get("backup-dir");
    if (!approvedDigest || !/^[0-9a-f]{64}$/.test(approvedDigest) || !backupDir)
      throw new Error(USAGE);
    const result = await applyPostResetUnions(db, {
      expectedWorldEpoch,
      approvedDigest,
      backupDir,
      approvalReference: args.get("approval-reference"),
      log: (line) => console.log(line),
    });
    console.log(JSON.stringify(result));
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Union repair failed");
    process.exitCode = 1;
  });
}
