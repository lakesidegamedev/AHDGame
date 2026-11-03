import type { StateLabourPoolView } from "@/lib/labour/rules/stateLabourPool";
import { fmtPct, fmtUnits } from "../lib/plants";

interface StateLabourPoolProps {
  pool: StateLabourPoolView;
  stateName: string;
}

/** True when the state's employers want more workers than staffing can give them. */
export function poolOversubscribed(pool: StateLabourPoolView): boolean {
  return pool.tightness != null && pool.tightness > 1;
}

/**
 * The state's shared labour pool, shown beside a sector's unfilled jobs so the
 * shortfall reads against the supply every employer in the state competes for.
 */
export default function StateLabourPool({ pool, stateName }: StateLabourPoolProps) {
  const oversubscribed = poolOversubscribed(pool);
  return (
    <div className="space-y-1.5">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 tabular-nums sm:grid-cols-2">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Workers available in {stateName}</dt>
          <dd className="font-semibold">{fmtUnits(pool.labourForce)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Workers all employers in {stateName} want</dt>
          <dd className="font-semibold">{fmtUnits(pool.labourDemand)}</dd>
        </div>
        {pool.corporateEmployed != null && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Hired by those employers so far</dt>
            <dd className="font-semibold">{fmtUnits(pool.corporateEmployed)}</dd>
          </div>
        )}
        {oversubscribed && pool.sectorRelativeBid != null && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Your pay vs the {stateName} average</dt>
            <dd className="font-semibold">{pool.sectorRelativeBid.toFixed(2)}×</dd>
          </div>
        )}
      </dl>
      {oversubscribed ? (
        <>
          <p>
            {pool.sectorRelativeBid != null
              ? "Every employer in this state hires from the same pool. Raising pay only wins you a bigger share compared with other employers here; it does not add workers."
              : "Every employer in this state hires from the same pool, so each fills the same share of the jobs it wants."}{" "}
            The workforce itself grows slowly as more residents look for work.
          </p>
          {pool.corporateEmployed != null && (
            <p>Open jobs here are still being filled and should catch up over the next turns.</p>
          )}
          <p className="tabular-nums">
            {pool.sectorRelativeBid != null ? "At this pay you" : "You"} can fill about{" "}
            {fmtPct(pool.targetStaffingFactor)} of your jobs. Your staffing moves toward that a
            little each turn.
          </p>
        </>
      ) : (
        <p>
          There are enough workers in this state for every employer. Your staffing recovers a little
          each turn.
        </p>
      )}
    </div>
  );
}
