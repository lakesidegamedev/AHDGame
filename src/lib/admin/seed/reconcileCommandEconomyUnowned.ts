/** Compatibility shim for the deploy migration script; removed with the market cell cleanup. */
import type { Db } from "mongodb";
import {
  reconcileCommandEconomySoes,
  type ReconcileCommandEconomySoesResult,
} from "./reconcileCommandEconomySoes";

export type ReconcileCommandEconomyUnownedResult = ReconcileCommandEconomySoesResult & {
  unownedDeleted: number;
};

export async function reconcileCommandEconomyUnowned(
  db: Db,
  opts: { dryRun?: boolean; preset?: string; log?: (msg: string) => void } = {}
): Promise<ReconcileCommandEconomyUnownedResult> {
  return { ...(await reconcileCommandEconomySoes(db, opts)), unownedDeleted: 0 };
}
