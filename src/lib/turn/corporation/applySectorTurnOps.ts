import type { SectorBuildOrder } from "@/lib/db/types";
import type { SectorUpdateOp } from "./types";

/**
 * Applies turn sector ops to a plain document the way Mongo's ordered
 * `bulkWrite` would.
 *
 * Test-support only. Tiny interpreter of exactly the operators the turn
 * uses, so assertions target behaviour rather than the op encoding, and
 * race tests can inject a COMMAND write mid-way through.
 */
export function applySectorTurnOps(
  doc: Record<string, unknown>,
  ops: readonly SectorUpdateOp[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...doc,
    buildQueue: Array.isArray(doc.buildQueue) ? [...(doc.buildQueue as SectorBuildOrder[])] : [],
  };
  for (const op of ops) {
    const u = op.updateOne.update;
    if (u.$set) Object.assign(out, u.$set);
    const pull = u.$pull?.buildQueue as { onlineTurn?: { $lte?: number } } | undefined;
    const lte = pull?.onlineTurn?.$lte;
    if (lte != null) {
      out.buildQueue = (out.buildQueue as SectorBuildOrder[]).filter((o) => !(o.onlineTurn <= lte));
    }
    if (u.$inc) {
      for (const [key, delta] of Object.entries(u.$inc)) {
        out[key] = ((out[key] as number) ?? 0) + delta;
      }
    }
    const pushed = u.$push?.buildQueue as SectorBuildOrder | undefined;
    if (pushed) {
      out.buildQueue = [...(out.buildQueue as SectorBuildOrder[]), pushed];
    }
  }
  return out;
}
