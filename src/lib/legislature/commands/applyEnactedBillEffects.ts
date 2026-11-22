import type { Db } from "mongodb";
import { onBillEnacted } from "@/lib/billEnactment";
import { applyLegislationEffect } from "@/lib/legislationEffects";

type EffectBill = Parameters<typeof applyLegislationEffect>[1];
type EnactmentBill = Parameters<typeof onBillEnacted>[1];

/**
 * Run the two shared enactment effect layers and reuse their legislation-type
 * catalog read. Both layers must succeed before the surrounding enactment transaction commits.
 */
export async function applyEnactedBillEffects(
  db: Db,
  bill: EffectBill & EnactmentBill,
  currentTurn: number,
  labels: { effect: string; enactment: string }
): Promise<void> {
  try {
    const legislationTypes = await applyLegislationEffect(db, bill, currentTurn);
    if (legislationTypes) await onBillEnacted(db, bill, currentTurn, legislationTypes);
    else await onBillEnacted(db, bill, currentTurn);
  } catch (error) {
    console.error(labels.enactment, error);
    throw error;
  }
}
