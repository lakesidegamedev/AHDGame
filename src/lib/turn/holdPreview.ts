import { createHash } from "node:crypto";
import type { Db, Document } from "mongodb";
import { withCurrentWorld } from "@/lib/audit/worldScope";
import { actionAuditLogCollection } from "@/lib/db/repositories/actionAuditLog";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { savingsLedgerCollection } from "@/lib/db/repositories/savingsLedger";
import { treasuryTransactionsCollection } from "@/lib/db/repositories/treasuryTransactions";
import { turnPhaseTraceId } from "@/lib/observability/context";
import {
  buildStepPreview,
  probeWindowStart,
  previewTokenInput,
  type StepPreview,
  type WriteProbeResult,
} from "@/lib/turn/rules/holdPreview";

type ProbeCollection = "financialTxLog" | "treasuryTransactions" | "savingsLedger";

interface SpecificProbe {
  label: string;
  collection: ProbeCollection;
  filter: (turn: number) => Document;
  sums: string[];
  /** Creation time of a row; rows older than the step belong to an earlier world. */
  timeField: "createdAt" | "ts";
}

const FUND_GENERATION_ROWS: SpecificProbe = {
  label: "fund generation treasury rows",
  collection: "treasuryTransactions",
  filter: (turn) => ({ turn, category: "fund_generation" }),
  sums: ["amount"],
  timeField: "createdAt",
};

/**
 * Probes for steps whose written rows can be found by turn. Only steps whose
 * ledger types or categories were read from the code are listed; every other
 * step is judged "unknown" unless the audit trail shows rows. Adding a step
 * here is how a step becomes previewable.
 */
const SPECIFIC_PROBES: Readonly<Record<string, SpecificProbe[]>> = {
  bondTurn: [
    {
      label: "bond ledger rows (coupon, maturity, default, issuance, pool, buyback)",
      collection: "financialTxLog",
      filter: (turn) => ({
        turn,
        type: {
          $in: [
            "bond_coupon",
            "bond_maturity",
            "bond_default",
            "bond_issuance",
            "bond_pool_inflow",
            "bond_pool_sweep",
            "bond_buyback",
            "bond_dissolution_payout",
          ],
        },
      }),
      sums: ["amount", "anchorAmount"],
      timeField: "createdAt",
    },
  ],
  caucusTax: [
    {
      label: "caucus tax treasury rows",
      collection: "treasuryTransactions",
      filter: (turn) => ({ turn, category: "caucus_tax" }),
      sums: ["amount"],
      timeField: "createdAt",
    },
  ],
  fundGeneration: [FUND_GENERATION_ROWS],
  nppFundGeneration: [FUND_GENERATION_ROWS],
  savingsInterestTurn: [
    {
      label: "savings ledger rows",
      collection: "savingsLedger",
      filter: (turn) => ({ turn }),
      sums: ["amount"],
      timeField: "createdAt",
    },
  ],
};

function collectionFor(db: Db, name: ProbeCollection) {
  switch (name) {
    case "financialTxLog":
      return financialTxLogCollection<Document>(db);
    case "treasuryTransactions":
      return treasuryTransactionsCollection<Document>(db);
    case "savingsLedger":
      return savingsLedgerCollection<Document>(db);
  }
}

async function countRows(
  collection: ReturnType<typeof collectionFor>,
  label: string,
  filter: Document,
  sumFields: string[]
): Promise<WriteProbeResult> {
  const group: Document = { _id: null, count: { $sum: 1 } };
  for (const f of sumFields) group[`sum_${f}`] = { $sum: { $ifNull: [`$${f}`, 0] } };
  const [row] = await collection
    .aggregate<Document>([{ $match: filter }, { $group: group }])
    .toArray();
  const sums: Record<string, number> = {};
  for (const f of sumFields) sums[f] = Math.round(((row?.[`sum_${f}`] as number) ?? 0) * 100) / 100;
  return { label, status: "found", count: (row?.count as number) ?? 0, sums };
}

export interface HeldTurnPreview {
  turn: number;
  heldAt: Date | null;
  steps: StepPreview[];
  /** Hash of the held turn, the step names and the counts. */
  previewToken: string;
}

export interface HeldStateFields {
  worldEpochId?: string | null;
  processingTargetTurn?: number | null;
  processingHeldPhases?: string[] | null;
  processingHeldAt?: Date | null;
  processingStartedAt?: Date | null;
  processingPhaseStatuses?: Record<string, { startedAt?: Date | null } | undefined> | null;
}

/** Read-only: what each held step already wrote for the held turn. */
export async function previewHeldTurn(
  db: Db,
  state: HeldStateFields
): Promise<HeldTurnPreview | null> {
  const turn = state.processingTargetTurn;
  const phases = state.processingHeldPhases ?? [];
  if (typeof turn !== "number" || phases.length === 0) return null;
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { auditLog: 1 } }
  );
  const auditOn = config?.auditLog === true;
  const steps: StepPreview[] = [];
  for (const phase of [...phases].sort()) {
    const probes: WriteProbeResult[] = [];
    const specific = SPECIFIC_PROBES[phase] ?? [];
    // Rows of an earlier world carry the same turn numbers, so only rows created since the
    // step started count. Without a known start nothing can be scoped, so nothing is claimed.
    const since = probeWindowStart(state.processingPhaseStatuses, phase, state.processingStartedAt);
    const unscoped = (label: string): WriteProbeResult => ({
      label,
      status: "unknown",
      reason: "the step's start time is unknown, so rows cannot be told from an earlier world's",
    });
    const auditLabel = "audited writes (action audit trail)";
    if (!auditOn) {
      probes.push({ label: auditLabel, status: "unknown", reason: "the action audit log is off" });
    } else if (!since) {
      probes.push(unscoped(auditLabel));
    } else {
      probes.push(
        await countRows(
          actionAuditLogCollection<Document>(db),
          auditLabel,
          withCurrentWorld(
            { traceId: turnPhaseTraceId(turn, phase), ts: { $gte: since } },
            state.worldEpochId
          ),
          ["amount", "anchorAmount"]
        )
      );
    }
    for (const p of specific) {
      probes.push(
        since
          ? await countRows(
              collectionFor(db, p.collection),
              p.label,
              { ...p.filter(turn), [p.timeField]: { $gte: since } },
              p.sums
            )
          : unscoped(p.label)
      );
    }
    steps.push(buildStepPreview(phase, probes, specific.length > 0));
  }
  return {
    turn,
    heldAt: state.processingHeldAt ?? null,
    steps,
    previewToken: createHash("sha256")
      .update(previewTokenInput(turn, steps))
      .digest("hex")
      .slice(0, 32),
  };
}

export async function loadHeldState(db: Db) {
  return gameStateCollection(db).findOne(
    { _id: "current" },
    {
      projection: {
        processingHoldReason: 1,
        processingHeldPhases: 1,
        processingHeldAt: 1,
        processingTargetTurn: 1,
        processingStartedAt: 1,
        processingPhaseStatuses: 1,
        worldEpochId: 1,
      },
    }
  );
}
