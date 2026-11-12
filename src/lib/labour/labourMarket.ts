/**
 * Corporate labor-demand and labor-market tightness rules.
 *
 * Corporate desired headcount is compared against civilian labor force:
 * the corporation turn writes demand, and the metric engine combines it
 * with the labor force it computes that turn. Without this check a sector
 * can carry far more workers than the state's labor force, with
 * unemployment unmoved.
 *
 * The tightness reading is used by unemployment and corporate staffing. The
 * corporation turn consumes the prior reading; the metric engine then writes
 * a same-turn reading for unemployment and the next corporate turn.
 */

/**
 * Per-state labour demand: the sum of every sector's revenue-implied headcount.
 *
 * Accumulated during the corporation turn's sector loop, one entry per state,
 * in the same "collect during the pure loop, consume after" pattern as
 * `wageIndexByState`. Deliberately NOT gated on `labour.wagesEnabled`: how many
 * jobs the corporate sector wants is a headcount fact that exists whether or not
 * the wage system is switched on, and gating it would leave the telemetry blank
 * in exactly the worlds most likely to need it.
 */
export type LabourDemandByState = Map<string, number>;

export function makeLabourDemandByState(): LabourDemandByState {
  return new Map<string, number>();
}

/**
 * Add one sector's desired headcount to its state's running demand total.
 *
 * Negative and non-finite inputs floor to 0 so a corrupt `workers` value cannot
 * drag a whole state's demand negative, which would read as slack where there
 * is none.
 */
export function accumulateLabourDemand(
  demandByState: LabourDemandByState,
  stateId: string,
  workers: number
): void {
  const w = Number.isFinite(workers) ? Math.max(0, workers) : 0;
  demandByState.set(stateId, (demandByState.get(stateId) ?? 0) + w);
}

/**
 * Labour market tightness: desired corporate headcount over available civilian
 * labour force. 1.0 means demand exactly matches supply; above 1 is
 * oversubscribed. Below 1 measures partial corporate coverage, not whole-
 * economy slack (regional unemployment uses the background-employment ledger).
 *
 * Returns `undefined` when supply is missing or not positive: a state with no
 * labourForce reading has UNKNOWN tightness, not infinite. Writing Infinity or
 * a sentinel 0 would poison the distribution. Callers skip the write instead.
 */
export function computeLabourTightness(
  demandWorkers: number,
  labourSupply: number | undefined | null
): number | undefined {
  if (typeof labourSupply !== "number" || !Number.isFinite(labourSupply) || labourSupply <= 0) {
    return undefined;
  }
  if (!Number.isFinite(demandWorkers) || demandWorkers < 0) return undefined;
  return demandWorkers / labourSupply;
}

/**
 * Rounding for the persisted tightness reading.
 *
 * Three decimals keeps slack markets legible (0.412 reads differently from
 * 0.418) while leaving oversubscribed ones unbounded, because the whole point of
 * the measurement is that some states read 200 and clamping the top of the range
 * would hide the finding.
 */
export function roundTightness(tightness: number): number {
  return Math.round(tightness * 1000) / 1000;
}

/**
 * Unemployment pressure per log-unit of labour market tightness.
 *
 * pp of unemployment target per 1.0 of ln(tightness). 0.5 is deliberately
 * small next to the Okun coefficients (0.2-0.25 per pp of output gap): the
 * measured-demand channel ADDS to Okun's law rather than replacing it, and a
 * tightness doubling (ln 2 = 0.69) shifts the target by 0.35pp, visible over
 * a sustained shock but never dominant in one turn.
 */
export const LABOUR_UNEMPLOYMENT_TIGHTNESS_K = 0.5;

/**
 * Per-turn cap on the tightness channel's target shift. An uncapped log term
 * would let one turn's telemetry whipsaw the target. The cap is a third the
 * size of the wage/automation siblings' because this is a LEVEL term (present
 * every turn the market stays tight) while theirs are one-time DELTA bumps.
 */
export const LABOUR_UNEMPLOYMENT_TIGHTNESS_CAP_PP = 0.5;

/**
 * One-turn unemployment-target pressure from the measured labor market.
 *
 * Tight market (tightness > 1, firms want more workers than exist) pushes the
 * target DOWN; slack (tightness < 1) pushes it UP. Log form so a doubling and
 * a halving move the target symmetrically. Missing, non-finite, or
 * non-positive tightness (cold start, no labour-force reading) returns 0, so
 * worlds that never measured tightness behave exactly as before.
 */
export function labourUnemploymentTightnessPressure(tightness: number | undefined | null): number {
  if (typeof tightness !== "number" || !Number.isFinite(tightness) || tightness <= 0) return 0;
  const pp = -LABOUR_UNEMPLOYMENT_TIGHTNESS_K * Math.log(tightness);
  return Math.max(
    -LABOUR_UNEMPLOYMENT_TIGHTNESS_CAP_PP,
    Math.min(LABOUR_UNEMPLOYMENT_TIGHTNESS_CAP_PP, pp)
  );
}

/**
 * Slope for the tightness bargaining score: 25 points per log-unit.
 * Tightness 1.0 scores 50; saturates at e^2 and e^-2 so extreme readings cap at 0/100.
 */
const LABOUR_TIGHTNESS_SCORE_K = 25;

/**
 * Map tightness ratio onto the 0-100 bargaining score. 1.0 scores 50.
 * Non-finite or non-positive input returns 50 (neutral), never 0, so corrupt
 * readings cannot read as maximum slack.
 */
export function labourTightnessScoreFromTightness(tightness: number): number {
  if (typeof tightness !== "number" || !Number.isFinite(tightness) || tightness <= 0) return 50;
  const score = 50 + LABOUR_TIGHTNESS_SCORE_K * Math.log(tightness);
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

export interface StateTightnessReading {
  /** Measured tightness ratio (demand over labour force). */
  tightness: number | undefined | null;
  /** Worker weight: the state's civilian labour force. */
  workers: number | undefined | null;
}

/**
 * Worker-weighted national tightness from per-state readings.
 *
 * Weight is each state's labour force, so a tiny state cannot swing the
 * national number the way a flat mean would. States missing tightness or a
 * usable weight are skipped; when none qualify the result is undefined and
 * the caller falls back (bargaining: the unemployment-derived score).
 *
 * The weighted mean equals the aggregate national ratio: weighting each
 * state's demand/supply by its supply sums to total demand over total supply.
 * The mean form is used because the state's persisted tightness is what the
 * corp turn wrote.
 */
export function nationalTightnessWorkerWeighted(
  readings: readonly StateTightnessReading[]
): number | undefined {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const reading of readings) {
    const { tightness, workers } = reading;
    if (typeof tightness !== "number" || !Number.isFinite(tightness) || tightness < 0) continue;
    if (typeof workers !== "number" || !Number.isFinite(workers) || workers <= 0) continue;
    weightedSum += tightness * workers;
    totalWeight += workers;
  }
  if (totalWeight <= 0) return undefined;
  return weightedSum / totalWeight;
}

/**
 * Staffing fill rate implied by state labour market tightness.
 *
 * All sectors fill the same pro rata share: tightness N means each
 * staffs 1/N of desired headcount. Slack markets and unknown tightness
 * return 1 (missing data must not throttle staffing).
 */
export function staffingFactorFromTightness(
  tightness: number | undefined | null,
  sectorWageLevel: number = 1,
  stateDemandWageIndex: number = 1
): number {
  if (typeof tightness !== "number" || !Number.isFinite(tightness) || tightness <= 1) return 1;
  return Math.max(
    0,
    Math.min(1, relativeWageBid(sectorWageLevel, stateDemandWageIndex) / tightness)
  );
}

/**
 * A sector's pay relative to the desired-worker-weighted pay of every employer
 * in its state, clamped to [0.25, 4]. This is the only lever pay has on a
 * rationed sector's share: if every employer raises pay together the ratio,
 * and so every allocation, stays where it was.
 */
export function relativeWageBid(
  sectorWageLevel: number = 1,
  stateDemandWageIndex: number = 1
): number {
  const wage = Number.isFinite(sectorWageLevel) && sectorWageLevel > 0 ? sectorWageLevel : 1;
  const marketWage =
    Number.isFinite(stateDemandWageIndex) && stateDemandWageIndex > 0 ? stateDemandWageIndex : 1;
  return Math.max(0.25, Math.min(4, wage / marketWage));
}

/** Maximum participation uplift created by sustained labour shortages. */
const LABOUR_PARTICIPATION_SHORTAGE_MAX_PP = 6;

/** Maximum change in the shortage participation uplift per turn. */
const LABOUR_PARTICIPATION_SHORTAGE_MAX_MOVE_PP = 0.25;

/**
 * Move the effective participation bonus toward the shortage implied target.
 * The authored participation metric remains the policy baseline. This bonus is
 * a bounded economic response from residents entering or leaving the workforce.
 */
export function nextLabourParticipationBonus(
  tightness: number | undefined | null,
  previousBonus: number | undefined | null
): number {
  const shortage =
    typeof tightness === "number" && Number.isFinite(tightness) && tightness > 1
      ? 1 - 1 / tightness
      : 0;
  const target = LABOUR_PARTICIPATION_SHORTAGE_MAX_PP * shortage;
  const previous =
    typeof previousBonus === "number" && Number.isFinite(previousBonus)
      ? Math.max(0, Math.min(LABOUR_PARTICIPATION_SHORTAGE_MAX_PP, previousBonus))
      : 0;
  const delta = Math.max(
    -LABOUR_PARTICIPATION_SHORTAGE_MAX_MOVE_PP,
    Math.min(LABOUR_PARTICIPATION_SHORTAGE_MAX_MOVE_PP, target - previous)
  );
  return Math.max(0, Math.min(LABOUR_PARTICIPATION_SHORTAGE_MAX_PP, previous + delta));
}

/**
 * Headcount a sector can actually staff, given what it wanted and what its state
 * can supply.
 *
 * Floors at 1 for any sector that wanted at least one worker: a rationed sector
 * is understaffed, not abolished, and a 0 here would divide-by-zero the
 * `wagePerWorker` derivation downstream.
 */
export function filledWorkers(desiredWorkers: number, staffingFactor: number): number {
  if (!Number.isFinite(desiredWorkers) || desiredWorkers <= 0) return 0;
  return Math.max(1, Math.round(desiredWorkers * staffingFactor));
}

/**
 * Most the staffing factor may FALL in a single turn, in absolute terms.
 *
 * A state that reads oversubscribed for the first time does not lose its
 * workforce overnight. The factor glides toward its target at up to this much
 * per turn, so the worst case (full staffing to fully rationed) takes ten turns
 * rather than one, and a CEO watching output fall has time to divest, relocate,
 * or shrink capacity before the constraint fully bites.
 *
 * The alternative was `capacityHaircutFactor`'s start-turn stamp, used by the
 * extraction haircut. It does not fit here: that ramp assumes a ONE-WAY
 * transition into a permanent constraint, whereas labour tightness comes and
 * goes as sectors are built and sold. A stamped sector whose state recovered
 * would stay pinned to a ramp that no longer describes anything.
 */
export const LABOUR_STAFFING_MAX_TURN_MOVE = 0.1;

/**
 * Most the staffing factor may RISE in a single turn at market pay.
 *
 * Hiring into posted openings where jobseekers exist is fast; losing a
 * workforce to a newly tight market is the slow side, and stays at
 * {@link LABOUR_STAFFING_MAX_TURN_MOVE}. At 0.1 a turn up as well, plants built
 * after an economy reset sat at 60% to 70% staffed in states with
 * high unemployment while their build orders added jobs faster than the ramp
 * filled them.
 */
export const LABOUR_STAFFING_MAX_TURN_RISE = 0.3;

/** Extra rise per turn for each 1.0 of pay above the state's going rate. */
export const LABOUR_STAFFING_WAGE_RISE_BONUS = 0.3;

/** Ceiling on the per-turn rise, however high the pay. */
export const LABOUR_STAFFING_MAX_TURN_RISE_CAP = 0.6;

/**
 * Per-turn rise for a sector paying `relativeBid` times the state's going rate
 * ({@link relativeWageBid}). Paying above market hires faster; paying below
 * market never hires slower than the base rise.
 */
export function staffingRiseForBid(relativeBid: number | undefined | null = 1): number {
  const bid = typeof relativeBid === "number" && Number.isFinite(relativeBid) ? relativeBid : 1;
  return Math.min(
    LABOUR_STAFFING_MAX_TURN_RISE_CAP,
    LABOUR_STAFFING_MAX_TURN_RISE + LABOUR_STAFFING_WAGE_RISE_BONUS * Math.max(0, bid - 1)
  );
}

/**
 * Glide this turn's staffing factor toward its target from last turn's value.
 *
 * Asymmetric. A cut glides down at {@link LABOUR_STAFFING_MAX_TURN_MOVE} so a
 * CEO has ten turns to react before a tight market fully bites. Hiring back up
 * rises at {@link staffingRiseForBid}: three turns from empty at market pay,
 * two at a strong premium. Both sides stop exactly on target, so neither can
 * overshoot or make a sector flip between full and throttled output.
 *
 * A sector with no previous factor starts from 1. That makes the ramp automatic
 * for the whole world rather than needing a migration, and it errs toward
 * paying a sector for output it may not be able to staff, which is the right
 * way round for a constraint arriving without warning.
 */
export function glideStaffingFactor(
  target: number,
  previous: number | undefined | null,
  relativeBid?: number | null
): number {
  const prev =
    typeof previous === "number" && Number.isFinite(previous)
      ? Math.max(0, Math.min(1, previous))
      : 1;
  const clampedTarget = Math.max(0, Math.min(1, target));
  if (clampedTarget >= prev) return Math.min(clampedTarget, prev + staffingRiseForBid(relativeBid));
  return Math.max(clampedTarget, prev - LABOUR_STAFFING_MAX_TURN_MOVE);
}
