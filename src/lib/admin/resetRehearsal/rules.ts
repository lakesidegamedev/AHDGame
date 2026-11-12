/**
 * Plausibility rules for a freshly reset world. Plain data in, a list of
 * failures out: conformance compares a world with its own seed, so these
 * checks catch seed values that are internally consistent but wrong.
 */

export interface RehearsalFailure {
  check: string;
  scope: string;
  message: string;
}

export interface BudgetRow {
  countryId: string;
  gdp: number;
  inflationRate?: number;
}

export interface CentralBankRow {
  id: string;
  countryId: string;
  primeRate: number;
}

export interface RegionRow {
  id: string;
  countryId: string;
  population: number;
  medianIncome?: number;
  gdpGrowth?: number;
}

export interface CorporationRow {
  id: string;
  ceoType?: string;
  countryId?: string;
  isNpcBank: boolean;
  liquidCapital?: number;
  totalShares?: number;
  shareholderShares?: number[];
  publicFloat?: number;
}

export interface SpawnPlanRow {
  countryId: string;
  perSectorCount: number;
}

export interface RehearsalWorld {
  rosterCountries: string[];
  playerEnabledCountries: string[];
  nppRunCountries: string[];
  noStartingParties: boolean;
  euroMembers: string[];
  budgets: BudgetRow[];
  centralBanks: CentralBankRow[];
  regions: RegionRow[];
  partyCountByCountry: Record<string, number>;
  spawnPlan: SpawnPlanRow[];
  operatingIndustryCount: number;
  corporations: CorporationRow[];
  seatTotalByCountry: Record<string, number>;
}

export const ECB_ROW_ID = "ECB";
const NORMAL_PRIME_MAX = 15;
const HIGH_INFLATION_THRESHOLD = 10;
const HIGH_INFLATION_PRIME_MAX = 60;
const INCOME_RATIO_MIN = 0.3;
const INCOME_RATIO_MAX = 1.5;
const GDP_GROWTH_MIN = -5;
const GDP_GROWTH_MAX = 10;
const NPC_BANKS_PER_COUNTRY = 2;
const SHARE_TOLERANCE = 1e-6;

function fail(check: string, scope: string, message: string): RehearsalFailure {
  return { check, scope, message };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));

export function checkBudgets(world: RehearsalWorld): RehearsalFailure[] {
  const byCountry = new Map(world.budgets.map((b) => [b.countryId, b]));
  const out: RehearsalFailure[] = [];
  for (const id of world.rosterCountries) {
    const row = byCountry.get(id);
    if (!row) out.push(fail("budget", id, "no national budget row"));
    else if (!(Number.isFinite(row.gdp) && row.gdp > 0))
      out.push(fail("budget", id, `national gdp is ${row.gdp}, expected > 0`));
  }
  return out;
}

export function checkCentralBanks(world: RehearsalWorld): RehearsalFailure[] {
  const out: RehearsalFailure[] = [];
  const euro = new Set(world.euroMembers);
  const ecb = world.centralBanks.find((b) => b.id === ECB_ROW_ID);
  const budgets = new Map(world.budgets.map((b) => [b.countryId, b]));
  const ownRow = (id: string) =>
    world.centralBanks.find((b) => b.id !== ECB_ROW_ID && b.countryId === id);

  for (const id of world.rosterCountries) {
    const row = ownRow(id);
    if (euro.has(id)) {
      if (!ecb) out.push(fail("centralBank", id, "euro member but no ECB row"));
      else if (row && row.primeRate !== ecb.primeRate)
        out.push(
          fail(
            "centralBank",
            id,
            `euro member prime rate ${fmt(row.primeRate)} differs from ECB ${fmt(ecb.primeRate)}`
          )
        );
    } else if (!row) {
      out.push(fail("centralBank", id, "no central bank row"));
    }
    const effective = row ?? (euro.has(id) ? ecb : undefined);
    if (!effective) continue;
    const inflation = budgets.get(id)?.inflationRate ?? 0;
    const max = inflation > HIGH_INFLATION_THRESHOLD ? HIGH_INFLATION_PRIME_MAX : NORMAL_PRIME_MAX;
    if (
      !Number.isFinite(effective.primeRate) ||
      effective.primeRate < 0 ||
      effective.primeRate > max
    )
      out.push(
        fail(
          "centralBank",
          id,
          `prime rate ${fmt(effective.primeRate)} outside 0 to ${max} (inflation ${fmt(inflation)})`
        )
      );
  }
  return out;
}

export function checkIncomePlausibility(world: RehearsalWorld): RehearsalFailure[] {
  const out: RehearsalFailure[] = [];
  const budgets = new Map(world.budgets.map((b) => [b.countryId, b]));
  for (const id of world.rosterCountries) {
    const budget = budgets.get(id);
    if (!budget || !(budget.gdp > 0)) continue;
    const regions = world.regions.filter((r) => r.countryId === id && r.population > 0);
    const population = regions.reduce((s, r) => s + r.population, 0);
    const withIncome = regions.filter(
      (r) => typeof r.medianIncome === "number" && Number.isFinite(r.medianIncome)
    );
    const incomePop = withIncome.reduce((s, r) => s + r.population, 0);
    if (population <= 0 || incomePop <= 0) {
      out.push(fail("income", id, "no regional population or median income to compare"));
      continue;
    }
    const weighted =
      withIncome.reduce((s, r) => s + (r.medianIncome ?? 0) * r.population, 0) / incomePop;
    const gdpPerHead = budget.gdp / population;
    const ratio = weighted / gdpPerHead;
    if (!(ratio >= INCOME_RATIO_MIN && ratio <= INCOME_RATIO_MAX))
      out.push(
        fail(
          "income",
          id,
          `median income ${fmt(weighted)} vs gdp per head ${fmt(gdpPerHead)}: ratio ${fmt(ratio)}, expected ${INCOME_RATIO_MIN} to ${INCOME_RATIO_MAX}`
        )
      );
  }
  return out;
}

export function checkRegionalGrowth(world: RehearsalWorld): RehearsalFailure[] {
  return world.regions
    .filter(
      (r) =>
        typeof r.gdpGrowth === "number" &&
        !(r.gdpGrowth >= GDP_GROWTH_MIN && r.gdpGrowth <= GDP_GROWTH_MAX)
    )
    .map((r) =>
      fail(
        "gdpGrowth",
        `${r.countryId}/${r.id}`,
        `regional gdp growth ${fmt(r.gdpGrowth as number)} outside ${GDP_GROWTH_MIN} to ${GDP_GROWTH_MAX}`
      )
    );
}

export function checkParties(world: RehearsalWorld): RehearsalFailure[] {
  const out: RehearsalFailure[] = [];
  const enabled = new Set(world.playerEnabledCountries);
  for (const id of world.rosterCountries) {
    const n = world.partyCountByCountry[id] ?? 0;
    if (world.noStartingParties && enabled.has(id)) {
      if (n !== 0)
        out.push(fail("parties", id, `${n} parties seeded in a no-starting-parties world`));
    } else if (n < 1) {
      out.push(fail("parties", id, "no political parties seeded"));
    }
  }
  return out;
}

export function checkStartingCompanies(world: RehearsalWorld): RehearsalFailure[] {
  const out: RehearsalFailure[] = [];
  for (const plan of world.spawnPlan) {
    const mine = world.corporations.filter((c) => c.countryId === plan.countryId);
    const operating = mine.filter((c) => c.ceoType === "npp" && !c.isNpcBank).length;
    const required = plan.perSectorCount * world.operatingIndustryCount;
    if (operating < required)
      out.push(
        fail(
          "companies",
          plan.countryId,
          `${operating} NPP corporations, expected at least ${required}`
        )
      );
    const banks = mine.filter((c) => c.isNpcBank).length;
    if (banks !== NPC_BANKS_PER_COUNTRY)
      out.push(
        fail("companies", plan.countryId, `${banks} NPC banks, expected ${NPC_BANKS_PER_COUNTRY}`)
      );
  }
  return out;
}

export function checkSeats(world: RehearsalWorld): RehearsalFailure[] {
  const required = new Set([...world.playerEnabledCountries, ...world.nppRunCountries]);
  return [...required]
    .filter((id) => !((world.seatTotalByCountry[id] ?? 0) > 0))
    .map((id) => fail("seats", id, "no seats seeded"));
}

export function checkMoney(world: RehearsalWorld): RehearsalFailure[] {
  const out: RehearsalFailure[] = [];
  for (const c of world.corporations) {
    if (c.liquidCapital !== undefined && !Number.isFinite(c.liquidCapital))
      out.push(fail("money", c.id, `liquidCapital is ${c.liquidCapital}`));
    if (
      c.ceoType === "npp" &&
      c.totalShares !== undefined &&
      c.shareholderShares !== undefined &&
      c.publicFloat !== undefined
    ) {
      const held = c.shareholderShares.reduce((s, n) => s + n, 0) + c.publicFloat;
      if (
        !Number.isFinite(held) ||
        Math.abs(held - c.totalShares) > SHARE_TOLERANCE * Math.max(1, c.totalShares)
      )
        out.push(
          fail(
            "money",
            c.id,
            `totalShares ${c.totalShares} but shareholders plus public float is ${held}`
          )
        );
    }
  }
  return out;
}

export const WORLD_CHECKS: ReadonlyArray<{
  name: string;
  run: (world: RehearsalWorld) => RehearsalFailure[];
}> = [
  { name: "budget", run: checkBudgets },
  { name: "centralBank", run: checkCentralBanks },
  { name: "income", run: checkIncomePlausibility },
  { name: "gdpGrowth", run: checkRegionalGrowth },
  { name: "parties", run: checkParties },
  { name: "companies", run: checkStartingCompanies },
  { name: "seats", run: checkSeats },
  { name: "money", run: checkMoney },
];

export interface CheckResult {
  name: string;
  passed: boolean;
  failures: RehearsalFailure[];
}

export function runWorldChecks(world: RehearsalWorld): CheckResult[] {
  return WORLD_CHECKS.map(({ name, run }) => {
    const failures = run(world);
    return { name, passed: failures.length === 0, failures };
  });
}

/** Local mongod on an explicit `rehearsal-` database only; the run resets everything. */
export function assertRehearsalTarget(uri: string, databaseName: string): void {
  const match = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri);
  if (!match) throw new Error("Rehearsal refuses a URI that is not a plain mongodb:// URI");
  const hosts = match[1].split(",").map((h) => h.replace(/:\d+$/, "").toLowerCase());
  if (!hosts.every((h) => h === "127.0.0.1" || h === "localhost"))
    throw new Error("Rehearsal refuses any host other than 127.0.0.1 or localhost");
  if (!databaseName.startsWith("rehearsal-"))
    throw new Error('Rehearsal refuses a database whose name does not start with "rehearsal-"');
}

export interface TurnOutcome {
  success?: boolean;
  failedPhases?: string[];
  abortedPhases?: string[];
}

export function checkTurnLog(log: TurnOutcome | null): RehearsalFailure[] {
  if (!log) return [fail("turn", "turnLogs", "no turn log was written")];
  const out: RehearsalFailure[] = [];
  if (log.success !== true) out.push(fail("turn", "turnLogs", "newest turn did not succeed"));
  for (const phase of log.failedPhases ?? []) out.push(fail("turn", phase, "phase failed"));
  for (const phase of log.abortedPhases ?? []) out.push(fail("turn", phase, "phase aborted"));
  return out;
}
