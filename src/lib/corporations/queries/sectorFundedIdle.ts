import type { CorporateSector } from "@/lib/db/types";
import type { CommodityType } from "@/lib/constants/commodities";
import { COMMODITY_LABELS } from "@/lib/constants/commoditiesCore";
import { SOLD_OUT_FILL } from "@/lib/turn/corporation/demandThrottle";
import type { PlantIdleCause } from "./sectorPlantsTypes";

export type IdleWeight = { cause: PlantIdleCause["cause"]; w: number; heldInput?: string };

/**
 * Idle weights from a funded settlement receipt, or null when the sector has
 * none for the last turn (legacy worlds keep the throttle reading).
 *
 * A funded plant loses run for distinct reasons, and the page has to name the
 * one the player can act on: the demand plan held its run below
 * capacity (demand, or ramping back up once it sells out), short inputs or
 * short cash cut what it made below that plan, and unsold output is demand.
 * A sold-out plant whose run was cut is held by that input or by cash, not
 * ramping up: the plan is not what is keeping it down.
 */
export function fundedIdleWeights(
  receipt: CorporateSector["producerSettlement"] | null | undefined,
  currentTurn: number
): IdleWeight[] | null {
  if (!receipt || !(receipt.turn >= currentTurn - 1)) return null;
  const active = receipt.activeUnits;
  if (!(Number.isFinite(active) && active > 0)) return null;
  const share = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
  const offered = receipt.offeredUnits;
  // Units delivered to the company's own sites found a use; they are not demand-idle.
  const ownDelivered = (receipt.products ?? []).reduce(
    (n, p) => n + Math.max(0, p.internalDeliveredUnits ?? 0),
    0
  );
  const sellThrough = offered > 0 ? share((receipt.soldUnits + ownDelivered) / offered) : 1;
  const runShare = share(receipt.plannedRunShare ?? 1);
  const made = share(receipt.producedUnits / active);
  const cutBy = receipt.runCutBy ?? [];
  const heldInput =
    cutBy.includes("inputs") && receipt.bindingInput
      ? (COMMODITY_LABELS[receipt.bindingInput as CommodityType] ?? receipt.bindingInput)
      : undefined;
  const held = heldInput != null || cutBy.includes("cash");
  const weights: IdleWeight[] = [];
  if (runShare < 1) {
    if (sellThrough < SOLD_OUT_FILL) weights.push({ cause: "demand", w: 1 - runShare });
    else if (held)
      weights.push({ cause: "held", w: 1 - runShare, ...(heldInput ? { heldInput } : {}) });
    else weights.push({ cause: "ramping", w: 1 - runShare });
  }
  const shortfall = Math.max(0, runShare - made);
  // Short inputs cut the run from the plant's own target, which productivity,
  // staffing and cash already hold below capacity at a planned share of 1. The
  // receipt's billed share is made / target, so the input cut is the units
  // between them; the rest of the gap to capacity belongs to the other legs.
  const billed = receipt.billedRunShare;
  const inputCut =
    cutBy.includes("inputs") && typeof billed === "number" && billed > 0 && billed < 1
      ? Math.min(shortfall, made * (1 / billed - 1))
      : null;
  if (inputCut != null) {
    if (inputCut > 0) weights.push({ cause: "inputs", w: inputCut });
    if (cutBy.includes("cash") && shortfall - inputCut > 0)
      weights.push({ cause: "cash", w: shortfall - inputCut });
  } else if (shortfall > 0) {
    // A stop the receipt does not explain (no recorded cut, no arrears) is not
    // blamed on inputs: the Inputs list names none, so the gap stays under
    // "other limits" instead of sending the player to a shortage that is not there.
    const cause =
      cutBy.length > 0
        ? cutBy.includes("inputs")
          ? "inputs"
          : "cash"
        : (receipt.operatingArrears ?? 0) > 0
          ? "cash"
          : null;
    if (cause) weights.push({ cause, w: shortfall });
  }
  return weights;
}
