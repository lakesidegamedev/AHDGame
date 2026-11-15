/** Deterministic opening-calendar and provincial service-funding qualification. */
import { caRegions2027 } from "../../src/lib/countries/ca/data/caRegions2027";
import { CA_PROVINCIAL_LEGISLATURES } from "../../src/lib/countries/ca/data/caProvincialLegislatures";
import { caProvincialServiceClaims } from "../../src/lib/countries/ca/rules/provincialServices";
import { provincialCycle1EndTurn } from "../../src/lib/countries/ca/rules/provincialLegislature";
import { resolveRegionalSpending } from "../../src/lib/budget/rules/regionalSpending";
import { pickNextCanonicalCycle } from "../../src/lib/elections/canonicalCycle";
import { electionToLarpYear } from "../../src/lib/utils/formatters";

const ctx = { preset: "2027-default", startingYear: 2027, preIterationTurns: 0 };
const rows = caRegions2027.map((region) => {
  const services = caProvincialServiceClaims("CA", ctx.preset, region._id);
  const authority = services.reduce((sum, claim) => sum + claim.authorizedCost, 0);
  let cash = 0;
  const fiscal = [1, 0.86, 0.9, 1.05].map((ratio, index) => {
    const revenue = Math.round(authority * ratio);
    const result = resolveRegionalSpending({
      baseSpending: { total: 0, byCategory: {} },
      services,
      laws: [],
      programs: [],
      revenue,
      cash,
      settle: true,
    });
    const openingCash = cash;
    cash += revenue - result.spending.total;
    if (
      result.authorizedSpending.total !== authority ||
      result.spending.total <= 0 ||
      cash < 0 ||
      result.spending.total > revenue + openingCash
    )
      throw new Error(`Service conservation failed: ${region._id}`);
    return {
      year: 2027 + index,
      revenue,
      authorized: authority,
      funded: result.spending.total,
      unfunded: result.settlement!.totalUnfunded,
      cash,
    };
  });
  const race = pickNextCanonicalCycle({
    countryId: "CA",
    electionType: "provincialLegislature",
    state: region._id,
    prevCycle: 0,
    currentTurn: 2,
    customCycle1EndTurn: provincialCycle1EndTurn(region._id, ctx),
    ctx,
  });
  if (!race || race.cycle !== 1) throw new Error(`Opening race skipped: ${region._id}`);
  const year = electionToLarpYear(
    "provincialLegislature",
    race.cycle,
    null,
    null,
    ctx,
    "CA",
    region._id
  );
  if (
    year !== CA_PROVINCIAL_LEGISLATURES[region._id].nextElectionYear ||
    year !== 2027 + Math.floor((race.endTurn - 1) / 48)
  )
    throw new Error(`Calendar mismatch: ${region._id}`);
  return { region: region._id, authority, fiscal, race: { ...race, year } };
});
if (rows.reduce((sum, r) => sum + r.authority, 0) !== 335_685_000_000)
  throw new Error("Opening baseline changed");
console.log(
  JSON.stringify(
    { scenario: "13 provinces, four fiscal years, first real opening turn", passed: true, rows },
    null,
    2
  )
);
