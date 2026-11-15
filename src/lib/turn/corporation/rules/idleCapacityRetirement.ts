/**
 * Retires plant capacity the market persistently will not buy.
 *
 * The demand throttle holds a glutted plant's OUTPUT at last turn's sales plus a
 * probe margin, but its CAPACITY never shrinks: headcount is staffed for the full
 * nameplate, idle units pay IDLE_UPKEEP_FRACTION, and depreciation alone has a
 * half-life over a thousand turns. A plant built for a market ten times its real
 * size pays payroll and upkeep on the excess forever.
 *
 * Once a plant has been demand-limited into a glut for more than
 * IDLE_RETIRE_GRACE_TURNS consecutive turns, it retires a fixed share of the
 * capacity the market does not justify:
 *
 *     justified = capacity x throttle x (1 + IDLE_RETIRE_HEADROOM)
 *     retired   = IDLE_RETIRE_RATE x max(0, capacity - justified)
 *
 * capacity x throttle is the capacity that would make this turn's demand-limited
 * run at this turn's input, labour, and policy rates, so an input-starved plant
 * keeps enough capacity to serve sales once inputs recover. Retirement only
 * removes demand-idle units, never input-idle ones. It converges exponentially,
 * so it is gradual and slows as the plant approaches a size it can sell.
 *
 * Does NOT retire: a plant that sold out (fill at or above
 * IDLE_RETIRE_GLUT_FILL); a plant whose throttle did not bind (limited by inputs,
 * labour, a disaster, or owner policy); mothballed or partly parked plants; and
 * any plant still inside the grace period. For NPP corps only, a plant that sells
 * out but stays under IDLE_RETIRE_STRUCTURAL_THROTTLE for
 * IDLE_RETIRE_STRUCTURAL_GRACE_TURNS is oversized, not recovering, and retires
 * toward its run with IDLE_RETIRE_STRUCTURAL_HEADROOM of room to grow back.
 */

/** Consecutive glutted turns a plant may run before any capacity retires. */
export const IDLE_RETIRE_GRACE_TURNS = 6;

/** Share of the unjustified capacity retired each turn once the grace has run. */
export const IDLE_RETIRE_RATE = 0.04;

/** Capacity kept above the demand-limited run, as a fraction of that run. */
export const IDLE_RETIRE_HEADROOM = 0.25;

/**
 * Sold share of last turn's output below which a demand-limited plant counts
 * as glutted. A throttled plant settles near 1 / (1 + probe margin), about
 * 0.87; a plant ramping into a recovering market sells everything it makes.
 */
export const IDLE_RETIRE_GLUT_FILL = 0.95;

/**
 * NPP engine 6: an NPP-run plant whose demand throttle stays below this share
 * of capacity is structurally oversized even when it sells everything it makes.
 * A recovering market lets the throttle climb by the probe margin each turn, so
 * a throttle that stays this low for the structural grace is not recovering.
 */
export const IDLE_RETIRE_STRUCTURAL_THROTTLE = 0.6;

/** Consecutive deeply-throttled turns an NPP-run plant may run before retiring. */
export const IDLE_RETIRE_STRUCTURAL_GRACE_TURNS = 6;

/** Glutted-turn grace for NPP-run plants; they shed idle capacity faster. */
export const NPP_IDLE_RETIRE_GRACE_TURNS = 2;

/** Share of the unjustified capacity an NPP-run plant retires each turn. */
export const NPP_IDLE_RETIRE_RATE = 0.15;

/** Headroom kept above the run for a structural retirement (room to grow back). */
export const IDLE_RETIRE_STRUCTURAL_HEADROOM = 0.5;

export interface IdleCapacityRetirementInput {
  plantsEnabled: boolean;
  mothballed: boolean;
  /** Active share of capacity, 0-1. Below 1 means the owner parked some. */
  activeFraction: number;
  /** This turn's demand throttle, in (0, 1]. */
  demandThrottleFactor: number;
  /**
   * Last turn's sold share of output, valued the way the throttle values it.
   * Null when there is no clearing signal.
   */
  demandFill: number | null | undefined;
  /** Persisted consecutive glutted turns before this one. */
  priorStreak: number | null | undefined;
  /** Plants transition ramp, 0 on the flip turn rising to 1. */
  rampLambda: number;
  /**
   * NPP engine 6, NPP-run corp: a sold-out plant held deeply under capacity by
   * the throttle for the structural grace also retires toward its run.
   */
  nppStructural?: boolean;
  /**
   * NPP-run corp: glutted plants use the shorter NPP grace and faster NPP rate.
   * Player and autopilot plants leave this unset.
   */
  nppRun?: boolean;
}

export interface IdleCapacityRetirementResult {
  /** Consecutive glutted turns including this one; 0 resets the streak. */
  streak: number;
  /** Share of owned capacity to retire this turn, in [0, NPP_IDLE_RETIRE_RATE]. */
  retireFraction: number;
}

export function idleCapacityRetirement(
  input: IdleCapacityRetirementInput
): IdleCapacityRetirementResult {
  const throttle = input.demandThrottleFactor;
  const fill = input.demandFill;
  const glutted =
    input.plantsEnabled &&
    !input.mothballed &&
    input.activeFraction >= 1 &&
    Number.isFinite(throttle) &&
    throttle > 0 &&
    throttle < 1 &&
    typeof fill === "number" &&
    Number.isFinite(fill) &&
    fill < IDLE_RETIRE_GLUT_FILL;
  const structural =
    !glutted &&
    input.nppStructural === true &&
    input.plantsEnabled &&
    !input.mothballed &&
    input.activeFraction >= 1 &&
    Number.isFinite(throttle) &&
    throttle > 0 &&
    throttle < IDLE_RETIRE_STRUCTURAL_THROTTLE;
  if (!glutted && !structural) return { streak: 0, retireFraction: 0 };

  const prior =
    typeof input.priorStreak === "number" && Number.isFinite(input.priorStreak)
      ? Math.max(0, Math.floor(input.priorStreak))
      : 0;
  const streak = prior + 1;
  const nppRun = input.nppRun === true || input.nppStructural === true;
  const grace = glutted
    ? nppRun
      ? NPP_IDLE_RETIRE_GRACE_TURNS
      : IDLE_RETIRE_GRACE_TURNS
    : IDLE_RETIRE_STRUCTURAL_GRACE_TURNS;
  if (streak <= grace) return { streak, retireFraction: 0 };

  const headroom = glutted ? IDLE_RETIRE_HEADROOM : IDLE_RETIRE_STRUCTURAL_HEADROOM;
  const excessShare = Math.max(0, 1 - throttle * (1 + headroom));
  const rate = nppRun ? NPP_IDLE_RETIRE_RATE : IDLE_RETIRE_RATE;
  const ramp = Number.isFinite(input.rampLambda) ? Math.max(0, Math.min(1, input.rampLambda)) : 0;
  return { streak, retireFraction: rate * excessShare * ramp };
}
