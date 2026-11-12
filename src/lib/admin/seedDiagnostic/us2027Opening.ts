/** Qualify the modeled US 2027 opening beyond simple record presence. */
import type { Db } from "mongodb";
import type {
  State,
  FederalBudget,
  ElectedOfficial,
  CongressionalDistrict,
  Bond,
  StateBudget,
} from "@/lib/db/types";
import type { MacroMetricsDoc } from "@/lib/db/types/macroMetrics";
import {
  allocateFormulaGrants,
  formulaGrantPool,
  grantPovertyRate,
} from "@/lib/budget/rules/formulaGrants";
import { formulaGrants } from "@/lib/seeds/reference/formulaGrants";
import {
  buildResetLawOpeningBoard,
  type ResetLawOpeningBoard,
} from "@/lib/resetLegislation/rules/openingBoard";
import type { RegionDemographics } from "@/lib/db/types/regionDemographics";
import type { ResetDepartmentAccountSnapshot } from "@/lib/resetFinance/rules/liveDepartmentAccount";
import { totalPopulation } from "@/lib/demographics/cohortVector";
import { getInitialNationalBudgetsForPreset } from "@/lib/seeds/reference/budgets";
import { usRegionalElectionYear2027 } from "@/lib/countries/us/rules/regionalElectionCalendar";
import snapshot from "@/lib/countries/us/data/us2026ResultsSnapshot.json";
import { canonicalTurnsForCycle } from "@/lib/elections/canonicalCycle";
import { check } from "./checkFactory";
import type { SeedDiagnosticCheck } from "./types";

export async function checkUS2027Opening(db: Db, preset: string): Promise<SeedDiagnosticCheck[]> {
  if (preset !== "2027-default") return [];
  const [
    states,
    cohorts,
    districts,
    officials,
    budget,
    accounts,
    elections,
    world,
    senators,
    shares,
    bonds,
    regionalBudgets,
    poverty,
    continuity,
    lawBoards,
  ] = await Promise.all([
    db
      .collection<State>("states")
      .find(
        { countryId: "US" },
        { projection: { _id: 1, population: 1, gdp: 1, stateSenateSeats: 1 } }
      )
      .toArray(),
    db
      .collection<RegionDemographics>("regionDemographics")
      .find({ countryId: "US" }, { projection: { _id: 1, ages: 1 } })
      .toArray(),
    db
      .collection<CongressionalDistrict>("congressionalDistricts")
      .find(
        { countryId: "US" },
        {
          projection: {
            _id: 1,
            stateId: 1,
            index: 1,
            holderParty: 1,
            holderNppId: 1,
            holderCharacterId: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<ElectedOfficial>("electedOfficials")
      .find(
        { countryId: "US" },
        { projection: { _id: 1, officeType: 1, seatsHeld: 1, senateClass: 1, nppId: 1, state: 1 } }
      )
      .toArray(),
    db.collection<FederalBudget>("federalBudget").findOne({ countryId: "US" }),
    db
      .collection<ResetDepartmentAccountSnapshot>("resetDepartmentAccounts")
      .find({ countryId: "US" })
      .toArray(),
    db
      .collection("elections")
      .find(
        { countryId: "US", electionType: { $in: ["governor", "stateSenate"] } },
        { projection: { state: 1, electionType: 1, cycle: 1, electionYear: 1, endTurn: 1 } }
      )
      .toArray(),
    db.collection("gameState").findOne(
      { _id: "current" as never },
      {
        projection: {
          cabinetSystemVersion: 1,
          legislationSystemVersion: 1,
          resetWorldId: 1,
          startingYear: 1,
          preIterationTurns: 1,
        },
      }
    ),
    db
      .collection("npps")
      .find(
        { countryId: "US", "currentOffice.type": "senate" },
        { projection: { _id: 1, currentOffice: 1 } }
      )
      .toArray(),
    db
      .collection("stateDemographics")
      .find({ countryId: "US" }, { projection: { _id: 1, groups: 1 } })
      .toArray(),
    db
      .collection<Bond>("bonds")
      .find(
        { countryId: "US", issuerType: "sovereign", matured: false, defaulted: false },
        { projection: { totalIssued: 1, couponRate: 1 } }
      )
      .toArray(),
    db
      .collection<StateBudget>("stateBudgets")
      .find({ countryId: "US" }, { projection: { stateId: 1, "revenue.federalGrants": 1 } })
      .toArray(),
    db
      .collection<MacroMetricsDoc>("macroMetrics")
      .find({ countryId: "US" }, { projection: { _id: 1, "economic.povertyRate.value": 1 } })
      .toArray(),
    db.collection("resetDepartmentContinuity").findOne({ countryId: "US" }),
    db
      .collection<ResetLawOpeningBoard>("resetLawOpeningBoards")
      .find({ countryId: "US" })
      .toArray(),
  ]);
  const checks: SeedDiagnosticCheck[] = [];
  const assert = (
    metric: string,
    valid: boolean,
    actual: number | string,
    expected: number | string
  ) =>
    checks.push(
      check(`opening.US.2027.${metric}`, "US", metric, expected, actual, valid ? "ok" : "critical")
    );
  const regionalGdp = states.reduce((sum, s) => sum + (s.gdp ?? 0) * 1e6, 0);
  const grantPool = budget ? formulaGrantPool(budget.revenue?.total ?? 0, formulaGrants) : NaN;
  const receipts = regionalBudgets.reduce((sum, b) => sum + b.revenue.federalGrants, 0);
  const reserves =
    accounts.reduce((sum, a) => sum + a.grantReservation, 0) + (continuity?.grantReservation ?? 0);
  assert(
    "grant-federal-pool",
    !!budget && Math.abs(budget.spending.stateGrants - grantPool) < 1,
    budget?.spending.stateGrants ?? "missing budget",
    grantPool
  );
  assert(
    "grant-regional-receipts",
    !!budget && Math.abs(receipts - grantPool) < 1,
    receipts,
    grantPool
  );
  if (world?.cabinetSystemVersion === "v2")
    assert("grant-reservations", Math.abs(reserves - grantPool) < 1, reserves, grantPool);
  const povertyById = new Map(poverty.map((p) => [String(p._id), p.economic?.povertyRate?.value]));
  const distribution = allocateFormulaGrants(
    budget?.revenue?.total ?? 0,
    formulaGrants,
    states.map((s) => ({
      id: s._id,
      population: s.population,
      povertyRate: grantPovertyRate(povertyById.get(s._id)),
    }))
  );
  const badGrants = regionalBudgets.filter(
    (b) => Math.abs(b.revenue.federalGrants - (distribution[b.stateId] ?? NaN)) >= 1
  );
  assert(
    "grant-poverty-allocation",
    badGrants.length === 0 && regionalBudgets.length === states.length,
    badGrants.length,
    0
  );
  let invalidBoards = 0;
  for (const board of lawBoards) {
    try {
      buildResetLawOpeningBoard({
        worldId: board.worldId,
        countryId: board.countryId,
        regionId: board.regionId,
        sourceTurn: board.sourceTurn,
        references: Object.values(board.references),
        modeled: !!board.modeledOpening,
        modeledOpening: board.modeledOpening,
        ukTerritorialTax: board.ukTerritorialTax,
      });
      if (
        Object.values(board.references).some((r) =>
          r.sourceComponents.some(
            (s) => Object.hasOwn(s, "replacementRestriction") && s.replacementRestriction == null
          )
        )
      )
        invalidBoards++;
    } catch {
      invalidBoards++;
    }
  }
  if (world?.legislationSystemVersion === "v2" || lawBoards.length)
    assert(
      "law-board-persistence",
      lawBoards.length === states.length + 1 && invalidBoards === 0,
      invalidBoards,
      0
    );
  const face = bonds.reduce((sum, b) => sum + b.totalIssued, 0);
  const coupons = bonds.reduce((sum, b) => sum + (b.totalIssued * b.couponRate) / 100, 0);
  assert(
    "sovereign-principal",
    !!budget && Math.abs(face - budget.debt?.principal) < 1,
    face,
    budget?.debt?.principal ?? "missing budget"
  );
  assert(
    "sovereign-debt-interest",
    !!budget && Math.abs(coupons - budget.spending.debtInterest) < 1,
    coupons,
    budget?.spending.debtInterest ?? "missing budget"
  );
  const senateById = new Map(senators.map((n) => [String(n._id), n.currentOffice]));
  const wrongClasses = officials
    .filter((o) => o.officeType === "senate" && o.nppId)
    .filter((o) => {
      const office = senateById.get(String(o.nppId));
      return !office || office.state !== o.state || office.senateClass !== o.senateClass;
    }).length;
  assert("senate-incumbent-classes", wrongClasses === 0, wrongClasses, 0);
  const wrongShares = shares.filter(
    (d) =>
      Math.abs(
        Object.values(d.groups as Record<string, { population: number }>).reduce(
          (sum, g) => sum + g.population,
          0
        ) - 100
      ) > 1e-8
  ).length;
  assert("demographic-share-conservation", wrongShares === 0, wrongShares, 0);
  if (districts.some((d) => d.holderParty === "DEM" || d.holderParty === "REP")) {
    const expectedParties = new Map(
      snapshot.house.map((d) => [
        d.district,
        d.party === "D" ? "DEM" : d.party === "R" ? "REP" : "IND",
      ])
    );
    const wrongParties = districts.filter(
      (d) =>
        d.holderParty !==
        (expectedParties.get(`${d.stateId}-${String(d.index).padStart(2, "0")}`) ??
          expectedParties.get(`${d.stateId}-AL`))
    ).length;
    assert("district-result-parties", wrongParties === 0, wrongParties, 0);
  }
  assert(
    "gdp-reconciliation",
    !!budget && Math.abs(regionalGdp - budget.gdp) < 100,
    regionalGdp,
    budget?.gdp ?? "missing budget"
  );
  const cohortById = new Map(cohorts.map((c) => [String(c._id), c]));
  const invalidCohorts = states.filter((s) => {
    const ages = cohortById.get(s._id)?.ages;
    return (
      !ages ||
      ages.male.length !== 101 ||
      ages.female.length !== 101 ||
      [...ages.male, ...ages.female].some((v) => !Number.isSafeInteger(v) || v < 0) ||
      totalPopulation(ages) !== s.population
    );
  }).length;
  assert("cohort-conservation", invalidCohorts === 0, invalidCohorts, 0);
  const house = officials
    .filter((o) => o.officeType === "house")
    .reduce((sum, o) => sum + (o.seatsHeld ?? 1), 0);
  if (house)
    assert(
      "district-holders",
      districts.length === house &&
        districts.every((d) => !!d.holderParty && !!(d.holderNppId || d.holderCharacterId)),
      districts.filter((d) => d.holderParty && (d.holderNppId || d.holderCharacterId)).length,
      house
    );
  const stateSenate = officials
    .filter((o) => o.officeType === "stateSenate")
    .reduce((sum, o) => sum + (o.seatsHeld ?? 1), 0);
  if (stateSenate)
    assert(
      "upper-chamber-capacity",
      stateSenate === states.reduce((sum, s) => sum + (s.stateSenateSeats ?? 0), 0),
      stateSenate,
      1973
    );
  const authored = getInitialNationalBudgetsForPreset(preset).find((b) => b.countryId === "US")!;
  if (budget) {
    const expectedTotal = Object.values(authored.spending.byCategory).reduce(
      (sum, n) => sum + n,
      0
    );
    const actualTotal = Object.values(budget.spending.byCategory).reduce((sum, n) => sum + n, 0);
    for (const category of ["defense", "healthcare", "socialSecurity", "education"]) {
      const expected = (authored.spending.byCategory[category] ?? 0) / expectedTotal;
      const actual = (budget.spending.byCategory[category] ?? 0) / actualTotal;
      assert(
        `composition-${category}`,
        Number.isFinite(actual) && Math.abs(actual - expected) < 0.0001,
        actual,
        expected
      );
    }
  }
  if (world?.cabinetSystemVersion === "v2") {
    const authority = accounts.reduce((sum, a) => sum + a.annualAuthority, 0);
    assert(
      "department-authority",
      accounts.length > 0 &&
        authority > 0 &&
        accounts.every((a) => a.worldId === world.resetWorldId),
      authority,
      "positive current-world authority"
    );
  }
  const wrongCalendars = elections.filter((e) => {
    if ((e.cycle ?? 1) === 0) return false;
    const expected = canonicalTurnsForCycle({
      countryId: "US",
      state: e.state,
      electionType: e.electionType,
      cycle: e.cycle ?? 1,
      ctx: {
        preset,
        startingYear: world?.startingYear ?? 2027,
        preIterationTurns: world?.preIterationTurns ?? 0,
      },
    });
    return (
      e.electionYear !== usRegionalElectionYear2027(e.state, e.electionType, e.cycle ?? 1) ||
      e.endTurn !== expected?.endTurn
    );
  }).length;
  assert("regional-calendars", wrongCalendars === 0, wrongCalendars, 0);
  checks.push(
    check(
      "opening.US.2027.provenance",
      "US",
      "political source",
      "provisional results with modeled gaps",
      snapshot.status,
      "warn",
      `Snapshot ${snapshot.capturedAt}. Pending runoff/RCV, missing counts and incomplete state chambers retain labeled modeled baselines. State-senate elections still renew aggregate chambers; staggered seat classes are unsupported.`
    )
  );
  return checks;
}
