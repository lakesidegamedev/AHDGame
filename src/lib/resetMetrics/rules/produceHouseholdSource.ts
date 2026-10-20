/**
 * Current household resources distinguish modeled income from settled cash flows.
 * produceHouseholdSource allocates only actual cash-law outlays, checks every
 * region and household, and returns explicit legacy gaps rather than inventing flows.
 */
import { adaptHouseholdCountry, HOUSEHOLD_COUNTRY_PROFILES } from "./householdCountryAdapter";
import { HOUSEHOLD_REFERENCE_INPUTS } from "./householdReadiness";
import { allocateHouseholdCash } from "./householdResources";
import {
  metricLawRoleMatches,
  type MetricLawProgram,
  type MetricLawSettlement,
} from "./lawDelivery";
import type {
  HouseholdCurrentState,
  HouseholdDecodedReference,
  HouseholdSourceProduction,
  HouseholdFiscalControls,
} from "./householdSources";
import { householdReferenceGaps, isPublicHouseholdCalibration } from "./householdSources";
import { householdBenefitFunding } from "./householdBenefitFunding";

const keyOf = (cell: { sourceArea: string; id: string }) =>
  JSON.stringify([cell.sourceArea, cell.id]);

export function produceHouseholdSource(input: {
  worldId: string;
  countryId: string;
  turn: number;
  year: number;
  regionIds: readonly string[];
  reference: HouseholdDecodedReference | undefined;
  current: HouseholdCurrentState | undefined;
  fiscalControls: HouseholdFiscalControls | undefined;
  programs: readonly MetricLawProgram[];
  settlements: ReadonlyMap<string, MetricLawSettlement>;
}): HouseholdSourceProduction {
  const legacy = (gaps: readonly string[]): HouseholdSourceProduction => ({
    evaluatedAtTurn: input.turn,
    path: "legacy",
    gaps: [...new Set(gaps)].sort(),
  });
  const reference = input.reference,
    current = input.current;
  const controlGap =
    current?.incomeBasis === "modeled-economic-income"
      ? "missing-modeled-household-controls"
      : "missing-independent-current-household-controls";
  const gaps: string[] = [];
  if (!Number.isSafeInteger(input.year) || input.year < 1) gaps.push("missing-current-game-year");
  if (!Object.hasOwn(HOUSEHOLD_COUNTRY_PROFILES, input.countryId))
    return legacy(["unsupported-country"]);
  if (!reference) gaps.push("missing-decoded-reference");
  if (!current) gaps.push("missing-current-household-owner");
  if (!input.fiscalControls) gaps.push(controlGap);
  if (reference) {
    gaps.push(
      ...householdReferenceGaps(reference, current?.incomeBasis === "modeled-economic-income").map(
        (g) => `reference:${g}`
      )
    );
    if (
      reference.version !== 1 ||
      reference.countryId !== input.countryId ||
      !reference.sourceId.trim() ||
      reference.incomeYear > input.year
    )
      gaps.push("incompatible-reference");
    if (
      reference.population !== "all-household-residents" ||
      reference.distribution !== "joint-household-groups"
    )
      gaps.push("incomplete-reference-population-or-distribution");
    if (
      !reference.cells.length ||
      reference.cells.length > 65_536 ||
      new Set(reference.cells.map(keyOf)).size !== reference.cells.length
    )
      gaps.push("invalid-reference-roster");
    if (
      reference.cells.some(
        (c) =>
          !c.id ||
          !c.sourceArea ||
          [
            c.households,
            c.adults,
            c.children,
            c.marketIncome,
            ...(current?.incomeBasis === "modeled-economic-income"
              ? []
              : [c.cashTransfers, c.directTaxes, c.employeeContributions]),
          ].some((v) => v === null || !Number.isFinite(v) || v < 0) ||
          !Number.isSafeInteger(c.adults) ||
          !Number.isSafeInteger(c.children) ||
          c.households! <= 0 ||
          c.adults! + c.children! < 1
      )
    )
      gaps.push("incomplete-reference-fields");
  }
  if (current) {
    if (
      current.calibration &&
      (current.incomeBasis !== "modeled-economic-income" ||
        !isPublicHouseholdCalibration(reference?.calibration) ||
        !isPublicHouseholdCalibration(current.calibration))
    )
      gaps.push("incompatible-public-cohort-provenance");
    if (
      current.worldId !== input.worldId ||
      current.countryId !== input.countryId ||
      current.turn !== input.turn ||
      current.year !== input.year ||
      !current.ownerId.trim() ||
      !current.basketSourceId.trim() ||
      current.referenceSourceId !== reference?.sourceId
    )
      gaps.push("stale-or-incompatible-economic-owner");
    const controls = input.fiscalControls;
    if (
      !controls ||
      controls.worldId !== input.worldId ||
      controls.countryId !== input.countryId ||
      controls.turn !== input.turn ||
      controls.currency !== current.currency ||
      controls.population !== "all-household-residents" ||
      controls.basis !==
        (current.incomeBasis === "modeled-economic-income"
          ? "modeled-household-flows"
          : "settled-household-flows") ||
      !controls.sourceId.trim() ||
      controls.sourceId === current.ownerId
    )
      gaps.push(controlGap);
    if (
      current.regions.length !== input.regionIds.length ||
      new Set(current.regions.map((r) => r.regionId)).size !== current.regions.length ||
      current.regions.some((r) => !input.regionIds.includes(r.regionId))
    )
      gaps.push("incomplete-current-regions");
    if (
      current.cells.some((c) => !c.id || !c.sourceArea) ||
      current.cells.length > 65_536 ||
      new Set(current.cells.map(keyOf)).size !== current.cells.length
    )
      gaps.push("invalid-current-household-roster");
    const referenceKeys = new Set(reference?.cells.map(keyOf));
    if (
      reference &&
      (current.cells.length !== reference.cells.length ||
        current.cells.some((c) => !referenceKeys.has(keyOf(c))))
    )
      gaps.push("current-reference-roster-mismatch");
    if (reference && reference.currency !== current.currency)
      gaps.push("reference-currency-mismatch");
  }
  if (gaps.length || !reference || !current || !input.fiscalControls) return legacy(gaps);

  const programs = input.programs.filter((p) => p.country === input.countryId);
  const roles = new Map(current.programRoles.map((r) => [r.programId, r]));
  if (
    roles.size !== current.programRoles.length ||
    roles.size !== programs.length ||
    current.programRoles.some(
      (r) => !["cash", "service", "capital", "regulation"].includes(r.role)
    ) ||
    programs.some((p) => !metricLawRoleMatches(p, roles.get(p._id)))
  )
    return legacy(["unclassified-current-law-option"]);
  const cashByCell = new Map(current.cells.map((c) => [keyOf(c), 0]));
  const currentCellsByKey = new Map(current.cells.map((c) => [keyOf(c), c]));
  const paidKeys = new Set<string>();
  let annualCash = 0;
  for (const program of programs) {
    const role = roles.get(program._id)!;
    if (role.role !== "cash") continue;
    if (program.scope !== "national" && !current.calibration)
      return legacy(["regional-annual-allocation-is-not-a-cash-receipt"]);
    if (
      !Number.isFinite(role.cashShare) ||
      role.cashShare! < 0 ||
      role.cashShare! > 1 ||
      !role.recipients
    )
      return legacy(["missing-reviewed-cash-eligibility"]);
    const recipients = new Map(role.recipients.map((r) => [keyOf(r), r.eligibility]));
    if (
      recipients.size !== role.recipients.length ||
      [...recipients.keys()].some((id) => !cashByCell.has(id))
    )
      return legacy(["invalid-cash-recipient-roster"]);
    const receipt = householdBenefitFunding(
      program,
      input.settlements,
      input.turn,
      !!current.calibration
    );
    if (!receipt) return legacy(["missing-current-cash-payment-receipt"]);
    if (paidKeys.has(receipt.key)) return legacy(["duplicate-cash-payment"]);
    paidKeys.add(receipt.key);
    const pool = receipt.annualAmount * role.cashShare!;
    let allocation;
    try {
      allocation = allocateHouseholdCash({
        paidPool: pool,
        recipients: role.recipients.map((r) => ({
          id: keyOf(r),
          households: currentCellsByKey.get(keyOf(r))!.households,
          eligibility: r.eligibility,
        })),
      });
    } catch {
      return legacy(["invalid-cash-allocation"]);
    }
    if (allocation.unallocated !== 0) return legacy(["paid-cash-has-no-eligible-households"]);
    for (const a of allocation.allocations)
      cashByCell.set(a.id, cashByCell.get(a.id)! + a.perHousehold);
    annualCash += allocation.allocated;
  }
  const controls = input.fiscalControls;
  const result = adaptHouseholdCountry({
    worldId: input.worldId,
    countryId: input.countryId,
    turn: input.turn,
    year: input.year,
    coverage: {
      countryId: input.countryId,
      currency: current.currency,
      priceBaseYear: current.priceBaseYear,
      measurementTurn: input.turn,
      regions: current.regions.map(({ regionId, householdResidents }) => ({
        regionId,
        householdResidents,
      })),
      references: Object.fromEntries(
        HOUSEHOLD_REFERENCE_INPUTS.map((name) => [
          name,
          {
            basis: current.calibration
              ? ("public-calibrated-model" as const)
              : ("reference" as const),
            sourceId:
              name === "consumerBasket"
                ? current.basketSourceId
                : name === "paidCashTransfers"
                  ? [...paidKeys].join(";") || `${controls.sourceId}:confirmed-no-cash-programs`
                  : `${reference.sourceId}:${current.ownerId}:${name}`,
          },
        ])
      ),
      reconciliation: {
        sourceId: controls.sourceId,
        countryId: input.countryId,
        currency: current.currency,
        measurementTurn: input.turn,
        marketIncome: controls.annualMarketIncome,
        paidCashTransfers: annualCash,
        directTaxes: controls.annualDirectTaxes,
        employeeContributions: controls.annualEmployeeContributions,
      },
    },
    programRoles: current.programRoles,
    extract: {
      countryId: reference.countryId,
      sourceId: reference.sourceId,
      incomeYear: reference.incomeYear,
      priceBaseYear: current.priceBaseYear,
      currency: current.currency,
      period: "annual",
      moneyUnit: "currency",
      weightDivisor: 1,
      population: reference.population,
      distribution: reference.distribution,
      composition: "integer-counts",
      equivalisation: "unequivalised",
      currentOwner: {
        sourceId: current.ownerId,
        worldId: current.worldId,
        measurementTurn: current.turn,
      },
      geography: current.geography,
      regions: current.geography.map((g) => ({
        sourceArea: g.sourceArea,
        consumerPriceIndex:
          current.regions.find((r) => r.regionId === g.regionId)?.consumerPriceIndex ?? NaN,
      })),
      rows: current.cells.map((c) => ({ ...c, paidCashTransfers: cashByCell.get(keyOf(c))! })),
    },
  });
  if (result.path === "legacy") return legacy(result.gaps);
  if (current.incomeBasis === "modeled-economic-income")
    result.source.incomeBasis = current.incomeBasis;
  if (current.calibration) result.source.calibration = current.calibration;
  return { evaluatedAtTurn: input.turn, path: "produced", gaps: [], source: result.source };
}
