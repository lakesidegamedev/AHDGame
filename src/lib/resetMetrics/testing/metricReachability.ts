/** Synthetic counterfactuals, not country forecasts or replacement opening data. */
import { primaryMetrics } from "../catalog";
import { buildOpeningMetricSnapshots1991 } from "../seedOpening1991";
import { driftProxyValue } from "../rules/policyDrift";
import { resetLawFamilies } from "@/lib/resetLegislation/catalog";
import { advanceEmployment } from "@/lib/labour/rules/employment";
import { resolveHouseholdResources, householdResourceOutcomes } from "../rules/householdResources";
import { outputGrowth, productivityGrowth } from "../rules/productivity";
import { fiscalOwnerReadings } from "../rules/fiscalOwner";
import { commodityTradeBalance } from "../rules/tradeOwner";
import { ownedHealthAccess } from "../rules/ownedHealthAccess";
import { linkedOutcomeTargets } from "../rules/linkedOutcomes";
import { calibratedMortalityRates, lifeFromMortalityRates } from "../rules/demographicMeasurement";
import { advanceHousing, housingPaymentBurden } from "../rules/housing";
import { latestTurnoutReceipts } from "../rules/turnoutOwner";
import { nationalForceReadiness } from "../rules/forceReadiness";
import { computeBirths } from "@/lib/demographics/flows/fertility";
import { realizedTfrFromBirths } from "../rules/realizedFertility";
import { dependencyBurden15To64 } from "../rules/cohortOpening";
import { derivePopulationMetrics } from "@/lib/demographics/populationMetrics";
import { buildSuccessorMetricRows } from "@/lib/referendum/secede/rules/resetV2Promotion";
import { SUB_REGION_SEEDS } from "@/lib/referendum/secede/subRegions";

export const modeledReachabilityIds = [
  "11",
  "12",
  "13",
  "14",
  "15",
  "17",
  "21",
  "22",
  "23",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
  "39",
  "40",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "50",
  "52",
  "53",
  "58",
] as const;

/** Every authored opening, including saturation, not just the first region. */
export function reachabilityBoards() {
  const boards = buildOpeningMetricSnapshots1991("reachability", 1);
  const successors = (["SCO", "WAL"] as const).flatMap((countryId) =>
    buildSuccessorMetricRows({
      countryId,
      aggregate: boards.find((b) => b._id === `UK:${countryId}`)!,
      national: boards.find((b) => b._id === "UK:national")!,
      regions: SUB_REGION_SEEDS[countryId].map((r) => ({ id: r._id, population: r.population })),
    })
  );
  return [...boards, ...successors];
}

export function modeledReachability(ids: readonly string[] = modeledReachabilityIds) {
  const rows = [];
  for (const board of reachabilityBoards())
    for (const year of [1991, 1996])
      for (const id of ids) {
        const opening = board.openingValues?.[id];
        if (opening === undefined) continue; // National-only metrics have no regional observation.
        const metric = primaryMetrics.find((m) => m.id === id)!;
        const families = resetLawFamilies.filter(
          (f) =>
            f.primaryMetricIds.includes(id) &&
            (f.availability.national.includes(board.countryId) ||
              (board.scope === "regional" && f.availability.regional.includes(board.countryId)))
        );
        const project = (pressure: number) => {
          // Production cadence rule closes the same gap as 144 constant-pressure turns.
          return driftProxyValue({
            metric: { ...metric, refresh: "144" },
            currentValue: opening,
            openingValue: opening,
            pressure,
            countryId: board.countryId,
            year,
          });
        };
        rows.push({
          board: board._id,
          country: board.countryId,
          year,
          id,
          opening,
          favorable: project(0.5),
          adverse: project(-0.5),
          families: families.map((f) => f.id),
        });
      }
  return rows;
}

/** Counted owners receive real input changes, never fictitious policy score bonuses. */
export function ownerReachability(countryId: string) {
  const result: { id: string; mechanism: string; before: number | null; after: number | null }[] =
    [];
  const add = (id: string, mechanism: string, before: number | null, after: number | null) =>
    result.push({ id, mechanism, before, after });
  const jobInput = {
    turn: 1,
    turnsPerYear: 48,
    laborForce: 1_000_000,
    unemployment: 4,
    corporateDemand: 20_000,
    matchingFriction: 4,
    workforceSkill: 50,
    outputGap: 0,
  };
  const jobs = advanceEmployment(jobInput);
  add(
    "01",
    "net corporate hiring",
    jobs.unemployment,
    advanceEmployment({ ...jobInput, turn: 2, previous: jobs.state, corporateDemand: 30_000 })
      .unemployment
  );
  const household = (improved: boolean) =>
    householdResourceOutcomes([
      resolveHouseholdResources({
        countryId,
        regionId: "synthetic",
        currency: countryId,
        priceBaseYear: 1991,
        measurementTurn: 2,
        consumerPriceIndex: 100,
        groups: [20, 100, 200].map((income, i) => ({
          id: String(i),
          households: i === 1 ? 2 : 1,
          adults: 1,
          children: 0,
          marketIncome: improved && i === 1 ? 120 : income,
          paidCashTransfers: improved && i === 0 ? 50 : 0,
          directTaxes: improved && i === 2 ? 20 : 0,
          employeeContributions: 0,
        })),
      }),
    ]);
  const h0 = household(false),
    h1 = household(true);
  add("02", "earnings", h0.realMedian, h1.realMedian);
  add("03", "paid transfers and taxes", h0.poverty50.rate, h1.poverty50.rate);
  add("04", "income distribution after taxes and transfers", h0.gini, h1.gini);
  const growth = {
    startTurn: 1,
    endTurn: 49,
    openingOutput: 1000,
    closingOutput: 1000,
    openingHours: 100,
    closingHours: 100,
  };
  add(
    "05",
    "real output over matched annual window",
    outputGrowth([growth]),
    outputGrowth([{ ...growth, closingOutput: 1100 }])
  );
  add(
    "06",
    "real output per hour over matched annual window",
    productivityGrowth([growth]),
    productivityGrowth([{ ...growth, closingOutput: 1100, closingHours: 105 }])
  );
  const f0 = fiscalOwnerReadings({
    gdp: 1000,
    revenue: 100,
    spending: 100,
    debtPrincipal: 500,
    inflationRate: 2,
  });
  const f1 = fiscalOwnerReadings({
    gdp: 1000,
    revenue: 120,
    spending: 100,
    debtPrincipal: 300,
    inflationRate: 5,
  });
  add("07", "budget inflation transmission", f0.priceChange, f1.priceChange);
  add("09", "tax receipts and expenditure", f0.balanceToGdp, f1.balanceToGdp);
  add("10", "outstanding principal after repayment", f0.debtToGdp, f1.debtToGdp);
  const trade = { exports: 10, imports: 10, annualGdpAnchor: 1000, turnsPerYear: 48 };
  add(
    "08",
    "cleared external trade",
    commodityTradeBalance(trade),
    commodityTradeBalance({ ...trade, exports: 20 })
  );
  const health = { coverageTarget: 80, delayTarget: 20, openingPreparedness: 60, preparedness: 60 };
  const a0 = ownedHealthAccess(health)!,
    a1 = ownedHealthAccess({ ...health, preparedness: 90 })!;
  add("16", "funded preparedness and delivered care", a0.coverage, a1.coverage);
  add("18", "funded preparedness and delivered care", a0.delay, a1.delay);
  const linked = (improved: boolean) =>
    linkedOutcomeTargets({
      opening: { "02": 100, "03": 20, "16": 80, "18": 20, "49": 50 },
      current: {
        "02": improved ? 150 : 100,
        "03": improved ? 10 : 20,
        "16": improved ? 90 : 80,
        "18": improved ? 10 : 20,
      },
      policyTargets: { "19": 100, "42": 20 },
      conditionChanges: [improved ? 20 : 0],
    });
  for (const id of ["19", "42", "49"])
    add(
      id,
      "delivered health, livelihoods and institutional outcomes",
      linked(false)[id]!,
      linked(true)[id]!
    );
  const life = (preventable: number) =>
    lifeFromMortalityRates(
      calibratedMortalityRates({
        openingYears: 75,
        openingPreventable: 100,
        currentPreventable: preventable,
      })
    );
  add("20", "health-related mortality flows", life(100), life(60));
  const burden = (assistance: number) =>
    housingPaymentBurden([
      {
        id: "tenant",
        households: 1,
        annualDisposableIncome: 100,
        annualHousingPayments: 40,
        annualLandlordAssistance: assistance,
      },
    ]).paymentBurden;
  add("24", "paid housing assistance", burden(0), burden(20));
  const house = (cash: number) =>
    advanceHousing(
      {
        worldId: "reachability",
        countryId,
        regionId: "synthetic",
        asOfTurn: 1,
        usableDwellings: 100,
        occupiedDwellings: 100,
        unhousedPeople: 10,
        constructionCash: 0,
        pipeline: [{ id: "ready", dwellings: 10, earliestCompletionTurn: 2 }],
      },
      {
        turn: 2,
        population: 400,
        constructionCashReceived: cash,
        costPerCompletedDwelling: 10,
        materialCapacity: 10,
        laborCapacity: 10,
        financeCapacity: 10,
        planningCapacity: 10,
        newProjects: [],
        dwellingsLost: 0,
        occupiedDwellingsLost: 0,
        displacedPeople: 0,
        vacatedDwellings: 0,
        otherNewOccupancies: 0,
        newlyUnhousedPeople: 0,
        rehousingHouseholds: 5,
        peoplePerRehousing: 2,
      }
    );
  // Compare the owner stocks/flows, not an invented policy effect on the displayed rate.
  add(
    "25",
    "funded usable dwelling completions",
    house(0).lastFlow!.completed,
    house(100).lastFlow!.completed
  );
  add("41", "available homes and rehousing", house(0).unhousedPeople, house(100).unhousedPeople);
  const turnout = (ballots: number) =>
    latestTurnoutReceipts(
      [{ regionId: "synthetic", turn: 2, ballots, eligible: 100, key: "election" }],
      2
    ).get("synthetic")!.ballots;
  add("51", "completed election ballots against same electorate", turnout(50), turnout(75));
  const vector = { male: Array<number>(101).fill(100), female: Array<number>(101).fill(100) };
  const migrant = structuredClone(vector);
  migrant.male[30]! += 100;
  migrant.female[30]! += 100;
  const flows = { births: 0, deaths: 0, netMigration: 0 };
  const population = (after: typeof vector, migration: number) =>
    derivePopulationMetrics(vector, after, { ...flows, netMigration: migration }, 48)
      .populationGrowth;
  add(
    "54",
    "net migration into actual population stock",
    population(vector, 0),
    population(migrant, 200)
  );
  add(
    "55",
    "fertility policy through realized birth flows",
    realizedTfrFromBirths(vector, computeBirths(vector, 1.5, 48), 48),
    realizedTfrFromBirths(vector, computeBirths(vector, 2.1, 48), 48)
  );
  add(
    "56",
    "working-age migration into age stocks",
    dependencyBurden15To64(vector),
    dependencyBurden15To64(migrant)
  );
  const ready = (supply: number) =>
    nationalForceReadiness([{ basePower: 100, readiness: 80, integrity: 100, supply }], 2);
  add("57", "maintained military supply", ready(50), ready(100));
  return result;
}
