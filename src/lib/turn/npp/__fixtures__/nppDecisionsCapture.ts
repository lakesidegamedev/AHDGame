/**
 * Canonical capture of one `processNppCorporationDecisions` run.
 *
 * The NPP brain is a pile of arithmetic plus a handful of branch points, so
 * "the decision is unchanged" has to mean every emitted write, every draw
 * against the unowned pool and every cash move, not a spot check on sector
 * counts. This module flattens one phase run into a stable string and hashes
 * it, both whole and per corporation, so a refactor that moves a rounding step
 * fails on the corporation that moved instead of on the file.
 *
 * Random ids are the one exception: a founded sector's `_id` and the founding
 * cash witness key are fresh `ObjectId`s on every run, so those are replaced by
 * their position in the founding order before hashing.
 */
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { processNppCorporationDecisions } from "@/lib/turn/nppCorporationBehavior";
import type { NppDecisionsWorld } from "./nppDecisionsWorld";

export interface NppDecisionsCapture {
  /** One hash over every decision output, the pool after the run and corp cash. */
  digest: string;
  /** Per corporation hash, so a mismatch names the corporation. */
  corps: Record<string, string>;
  /** Outputs that are not owned by a single corporation, hashed together. */
  unowned: string;
  counts: {
    corpUpdates: number;
    sectorUpdates: number;
    newSectors: number;
    divested: number;
    techLedger: number;
    manufacturingProjects: number;
    reinvestmentWitnesses: number;
    constructionFinanceRequests: number;
  };
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => {
    if (inner instanceof ObjectId) return inner.toHexString();
    if (inner instanceof Date) return inner.toISOString();
    if (inner === undefined) return null;
    return inner;
  });
}

/** Witness rows carry freshly minted transaction ids; drop them, keep the money. */
function stripMintedIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMintedIds);
  if (value instanceof ObjectId || value instanceof Date) return value;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (key === "_id" || key === "key" || key === "nppReinvestmentCashWitnessKey") continue;
      out[key] = stripMintedIds(inner);
    }
    return out;
  }
  return value;
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function idOf(value: unknown): string | null {
  if (value instanceof ObjectId) return value.toHexString();
  if (typeof value === "string") return value;
  return null;
}

export async function captureNppDecisions(
  db: Db,
  world: NppDecisionsWorld,
  techTreesEnabled: boolean
): Promise<NppDecisionsCapture> {
  const sectorCorp = new Map<string, string>();
  const sectorRows = await db
    .collection("corporateSectors")
    .find({}, { projection: { _id: 1, corporationId: 1 } })
    .toArray();
  for (const sector of sectorRows) {
    const row = sector as { _id: ObjectId; corporationId: ObjectId };
    sectorCorp.set(row._id.toHexString(), row.corporationId.toHexString());
  }

  const result = await processNppCorporationDecisions(db, world.turn, world.now, techTreesEnabled);

  // Positional ids for the two random-id outputs.
  const founded = result.newSectors.map((sector, index) => {
    const { _id, ...rest } = sector as unknown as Record<string, unknown>;
    void _id;
    return { foundingIndex: index, ...rest };
  });

  const perCorp = new Map<string, unknown[]>();
  const push = (corpId: string | null, entry: unknown) => {
    const key = corpId ?? "unassigned";
    const list = perCorp.get(key) ?? [];
    list.push(entry);
    perCorp.set(key, list);
  };

  for (const op of result.corpUpdates) {
    const filter = op.filter as { _id?: unknown } | undefined;
    // The reinvestment cash witness key is minted fresh for this write, so it
    // is position-stable only; the witness itself is compared in `unowned`.
    const update = op.update as { $set?: Record<string, unknown> } | undefined;
    const normalized = update?.$set
      ? (() => {
          const { nppReinvestmentCashWitnessKey, ...rest } = update.$set;
          void nppReinvestmentCashWitnessKey;
          return { ...op, update: { ...update, $set: rest } };
        })()
      : op;
    push(idOf(filter?._id), { kind: "corpUpdate", op: normalized });
  }
  for (const op of result.sectorUpdates) {
    const filter = op.filter as { _id?: unknown };
    push(sectorCorp.get(idOf(filter._id) ?? "") ?? null, { kind: "sectorUpdate", op });
  }
  for (const sector of founded) {
    const corporationId = (sector as { corporationId?: unknown }).corporationId;
    push(idOf(corporationId), { kind: "founded", sector });
  }
  for (const sectorId of result.divestedSectorIds) {
    push(sectorCorp.get(sectorId.toHexString()) ?? null, {
      kind: "divested",
      sectorId: sectorId.toHexString(),
    });
  }
  for (const entry of result.techLedger) {
    push(idOf(entry.corporationId), { kind: "tech", entry });
  }
  for (const project of result.manufacturingProductProjects) {
    const corporationId = (project as { corporationId?: unknown }).corporationId;
    push(idOf(corporationId), { kind: "manufacturingProject", project });
  }
  for (const request of result.constructionFinanceRequests) {
    const corporationId = (request as { corporation?: { _id?: unknown } }).corporation?._id;
    push(idOf(corporationId), { kind: "constructionFinance", request });
  }

  const corps: Record<string, string> = {};
  for (const corpId of [...perCorp.keys()].sort()) {
    corps[corpId] = hash(perCorp.get(corpId));
  }

  // World state the phase moves on its own: the pool it drew founding headroom
  // from and the corporation cash it settled through the writeback.
  const pool = (await db.collection("unownedSectors").find({}).toArray())
    .map((row) => {
      const doc = row as { _id: ObjectId; headroomUnits?: number; revenue?: number };
      return [doc._id.toHexString(), doc.headroomUnits ?? null, doc.revenue ?? null];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const corpsAfter = (await db.collection("corporations").find({}).toArray())
    .map((row) => {
      const doc = row as { _id: ObjectId; liquidCapital?: number; nppStrategy?: unknown };
      return [doc._id.toHexString(), doc.liquidCapital ?? null, doc.nppStrategy ?? null];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const unowned = hash({
    pool,
    corpsAfter,
    reinvestmentWitnesses: stripMintedIds(result.reinvestmentCashWitnesses ?? []),
    foundingWitnesses: stripMintedIds(result.foundingCashWitnesses ?? []),
    constructionFinanceCandidateCount: result.constructionFinanceCandidateCount,
    constructionFinanceBacklogCount: result.constructionFinanceBacklogCount,
  });

  const digest = hash({ corps, unowned });

  return {
    digest,
    corps,
    unowned,
    counts: {
      corpUpdates: result.corpUpdates.length,
      sectorUpdates: result.sectorUpdates.length,
      newSectors: result.newSectors.length,
      divested: result.divestedSectorIds.length,
      techLedger: result.techLedger.length,
      manufacturingProjects: result.manufacturingProductProjects.length,
      reinvestmentWitnesses: result.reinvestmentCashWitnesses?.length ?? 0,
      constructionFinanceRequests: result.constructionFinanceRequests.length,
    },
  };
}
