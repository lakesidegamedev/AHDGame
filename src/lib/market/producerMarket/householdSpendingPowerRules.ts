/**
 * Household spending power: each state's households are topped up each turn
 * toward population times the average wage, so what people can spend follows
 * how many they are and what they earn, not only the wages plants happen to
 * pay. The top-up is new money, phased in over several turns. Pure.
 */

/** Share of population times median income that a state's households can spend per year. */
export const HOUSEHOLD_SPENDING_POWER_SHARE = 7.14e-5;
/** Turns the top-up takes to reach its full size. */
export const HOUSEHOLD_SPENDING_POWER_RAMP_TURNS = 72;
const TURNS_PER_YEAR = 48;
/** Plant workers as a multiple of the labour force at which plant pay fully sets the state's wage level. */
const WAGE_INFLUENCE_MULTIPLE = 10;
/**
 * A wallet already holding this many turns of its target gets no more top-up.
 * Households in a state with little to buy cannot spend the money, and without
 * this cap the unspent top-up would pile up every turn and flood the market
 * once supply arrives.
 */
export const HOUSEHOLD_SPENDING_POWER_CASH_CAP_TURNS = 3;
/** Working-age share of a population when the state has no working-age count. */
const FALLBACK_WORKING_AGE_SHARE = 0.6;

/** gameConfig.householdSpendingPowerStage: absent = on, 0 = off. */
export function householdSpendingPowerOn(env: { householdSpendingPowerStage?: number }): boolean {
  return (env.householdSpendingPowerStage ?? 1) >= 1;
}

export interface SpendingPowerPlant {
  stateId: string;
  workers: number;
  /** Clamped sector wage level times the plant's tech labour cost multiplier. */
  wageMultiplier: number;
}

/** Workers-weighted mean wage multiplier over a state's plants, or null with no staffed plant. */
export function averageWageMultiplier(plants: readonly SpendingPowerPlant[]): {
  workers: number;
  mean: number;
} | null {
  let workers = 0;
  let weighted = 0;
  for (const p of plants) {
    if (!(p.workers > 0) || !Number.isFinite(p.wageMultiplier) || p.wageMultiplier <= 0) continue;
    workers += p.workers;
    weighted += p.workers * p.wageMultiplier;
  }
  return workers > 0 ? { workers, mean: weighted / workers } : null;
}

/** 1 + influence x (average multiplier - 1); 1 for a state with no staffed plants. */
export function wageFactor(input: {
  plants: readonly SpendingPowerPlant[];
  population: number;
  workingAgePopulation?: number;
}): number {
  const avg = averageWageMultiplier(input.plants);
  if (!avg) return 1;
  const laborForce =
    input.workingAgePopulation != null && input.workingAgePopulation > 0
      ? input.workingAgePopulation
      : FALLBACK_WORKING_AGE_SHARE * input.population;
  if (!(laborForce > 0)) return 1;
  const influence = Math.min(1, (avg.workers / laborForce) * WAGE_INFLUENCE_MULTIPLE);
  return 1 + influence * (avg.mean - 1);
}

/** Per-turn spending power target of one state, anchor currency. */
export function spendingPowerTarget(input: {
  population: number;
  /** Median income in anchor currency per year. */
  medianIncomeAnchor: number;
  wageFactor: number;
  share?: number;
}): number {
  const { population, medianIncomeAnchor } = input;
  if (!(population > 0) || !(medianIncomeAnchor > 0) || !(input.wageFactor > 0)) return 0;
  const share = input.share ?? HOUSEHOLD_SPENDING_POWER_SHARE;
  return (share * population * medianIncomeAnchor * input.wageFactor) / TURNS_PER_YEAR;
}

/** 0 before the start turn, 1 once the ramp is over. */
export function spendingPowerRamp(input: {
  turn: number;
  startTurn: number;
  rampTurns?: number;
}): number {
  const ramp = input.rampTurns ?? HOUSEHOLD_SPENDING_POWER_RAMP_TURNS;
  if (!(ramp > 0)) return input.turn >= input.startTurn ? 1 : 0;
  return Math.min(1, Math.max(0, (input.turn - input.startTurn) / ramp));
}

export interface SpendingPowerWallet {
  accountId: string;
  stateId: string;
  countryId: string;
}

export interface SpendingPowerStateInput {
  population: number;
  workingAgePopulation?: number;
  /** Median income, local currency per year. */
  medianIncomeLocal: number | undefined;
}

export interface SpendingPowerRow {
  walletId: string;
  countryId: string;
  /** Anchor currency, per turn. */
  amount: number;
  /** The wallet's target this turn, anchor, before the ramp. */
  target: number;
}

/**
 * Each wallet's top-up: what its state's target exceeds the income the wallet
 * already gets this turn (wages, transfers, growth income), times the ramp.
 */
export function spendingPowerTopUps(input: {
  wallets: readonly SpendingPowerWallet[];
  stateById: ReadonlyMap<string, SpendingPowerStateInput>;
  localPerAnchorByCountry: ReadonlyMap<string, number>;
  plantsByState: ReadonlyMap<string, readonly SpendingPowerPlant[]>;
  /** Wages, transfers and growth income each wallet receives this turn, anchor. */
  incomeByWallet: ReadonlyMap<string, number>;
  /** Cash each wallet already holds before this top-up (carried savings plus this turn's other income), anchor. */
  cashByWallet?: ReadonlyMap<string, number>;
  /** Turns of target a wallet may hold before its top-up stops. */
  cashCapTurns?: number;
  turn: number;
  startTurn: number;
  rampTurns?: number;
  share?: number;
}): SpendingPowerRow[] {
  const ramp = spendingPowerRamp(input);
  if (!(ramp > 0)) return [];
  const out: SpendingPowerRow[] = [];
  for (const w of [...input.wallets].sort((a, b) => (a.accountId < b.accountId ? -1 : 1))) {
    const state = input.stateById.get(w.stateId);
    const rate = input.localPerAnchorByCountry.get(w.countryId);
    if (!state || !(rate && rate > 0) || state.medianIncomeLocal == null) continue;
    const target = spendingPowerTarget({
      population: state.population,
      medianIncomeAnchor: state.medianIncomeLocal / rate,
      wageFactor: wageFactor({
        plants: input.plantsByState.get(w.stateId) ?? [],
        population: state.population,
        workingAgePopulation: state.workingAgePopulation,
      }),
      share: input.share,
    });
    const income = input.incomeByWallet.get(w.accountId) ?? 0;
    const wanted = Math.max(0, target - (Number.isFinite(income) ? income : 0)) * ramp;
    const cash = input.cashByWallet?.get(w.accountId) ?? 0;
    const room = Math.max(
      0,
      (input.cashCapTurns ?? HOUSEHOLD_SPENDING_POWER_CASH_CAP_TURNS) * target -
        (Number.isFinite(cash) ? cash : 0)
    );
    const amount = Math.min(wanted, room);
    if (amount > 0) out.push({ walletId: w.accountId, countryId: w.countryId, amount, target });
  }
  return out;
}
