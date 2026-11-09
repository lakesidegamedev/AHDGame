import type { PlantIdleCause } from "../types";

export interface ShortInputState {
  /** The commodity named as short: the throttle's input, else the one the run receipt named. */
  commodity: string | null;
  /** Share of capacity the "inputs" idle cause held, null when capacity is unknown. */
  idleShare: number | null;
  /** Show the callout naming the input (it explains the run meter's "waiting on inputs" slice). */
  showsCallout: boolean;
  /** Inputs held capacity idle but nothing records which input. */
  unknownWhich: boolean;
}

export function shortInputState(args: {
  throughputBinding: string | null | undefined;
  throttleApplied: number | null;
  capacityUnits: number | null | undefined;
  idleCauses: readonly Pick<PlantIdleCause, "cause" | "units" | "bindingInput">[] | undefined;
}): ShortInputState {
  const cause = args.idleCauses?.find((c) => c.cause === "inputs");
  const idleUnits = cause?.units ?? 0;
  const capacity = args.capacityUnits;
  const idleShare =
    capacity != null && capacity > 0 ? Math.min(1, Math.max(0, idleUnits / capacity)) : null;
  const commodity = args.throughputBinding ?? cause?.bindingInput ?? null;
  const showsCallout =
    commodity != null &&
    ((idleShare ?? 0) > 0.005 || (args.throttleApplied != null && args.throttleApplied < 0.999));
  return {
    commodity,
    idleShare,
    showsCallout,
    unknownWhich: commodity == null && idleUnits > 0,
  };
}

/** The row to flag "Short input": the named commodity, once the plant lost run to inputs or the callout shows. */
export function isShortInputRow(
  state: ShortInputState,
  commodity: string,
  inputIdleUnits: number
): boolean {
  return state.commodity === commodity && (inputIdleUnits > 0 || state.showsCallout);
}
