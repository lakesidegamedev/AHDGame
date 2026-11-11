/** Qualify the modeled US 2027 opening beyond simple record presence. */
import type { Db } from "mongodb";
import type { State, FederalBudget, ElectedOfficial, CongressionalDistrict } from "@/lib/db/types";
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
  const [states, cohorts, districts, officials, budget, accounts, elections, world] =
    await Promise.all([
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
          { projection: { _id: 1, holderParty: 1, holderNppId: 1, holderCharacterId: 1 } }
        )
        .toArray(),
      db
        .collection<ElectedOfficial>("electedOfficials")
        .find({ countryId: "US" }, { projection: { _id: 1, officeType: 1, seatsHeld: 1 } })
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
            resetWorldId: 1,
            startingYear: 1,
            preIterationTurns: 1,
          },
        }
      ),
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
