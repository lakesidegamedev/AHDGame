import type { Db, Document } from "mongodb";
import { getCharactersCollection } from "@/lib/db/collections/characters";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import { getGameStateCollection } from "@/lib/db/collections/gameState";
import { getNppsCollection } from "@/lib/db/collections/npps";
import { getStatesCollection } from "@/lib/db/collections/states";
import { getCollectionsByCategory } from "@/lib/admin/seed/seedManifest";
import {
  RESIDUE_SCAN_REFERENCE_EXEMPT,
  RESIDUE_SCAN_RUNTIME_EXEMPT,
  residueScanAgeCollections,
} from "@/lib/admin/resetContract/residueScan";
import {
  evaluatePreflight,
  LEGACY_APPROVAL_FIELD,
  type PreflightFinding,
  type PreflightMode,
  type SeatFieldRequirement,
  type StateEvidence,
} from "@/lib/admin/resetContract/rules/preflight2027";
import { evaluateResidueScan } from "@/lib/admin/resetContract/rules/residueScan";
import type { CountryId } from "@/lib/constants/countries";
import { DE_LANDTAG_SPEC } from "@/lib/countries/de/elections/chamberSpecs";
import { countriesByTier, type ShippingPreset } from "@/lib/world/eraRoster";
import { checkSeedContract } from "@/lib/seeds/contract/checkSeedContract";

export const PREFLIGHT_PRESET: ShippingPreset = "2027-default";

/** Countries the 2027 world simulates in full: players and NPP-run alike. */
export function fullSimulationCountries(preset: ShippingPreset): string[] {
  return (["player", "econ", "npp"] as const).flatMap((tier) => countriesByTier(preset, tier));
}

/**
 * State-document seat fields the chamber spawners read. DE comes from the
 * chamber spec itself; US and UK read the fields in apportionment and
 * constituency allocation, where a territory may legitimately hold zero.
 */
export const SEAT_FIELD_REQUIREMENTS: readonly SeatFieldRequirement[] = [
  ...(DE_LANDTAG_SPEC.seats.kind === "stateField"
    ? [
        {
          countryId: DE_LANDTAG_SPEC.countryId,
          field: DE_LANDTAG_SPEC.seats.field,
          level: "positive" as const,
          source: "Landtag chamber spec",
        },
      ]
    : []),
  { countryId: "US", field: "houseDistricts", level: "present", source: "House apportionment" },
  { countryId: "US", field: "stateSenateSeats", level: "present", source: "state senate races" },
  { countryId: "UK", field: "houseDistricts", level: "present", source: "Commons allocation" },
];

/**
 * Does the residue scan's own contract hold together? Every exemption must name
 * a real collection of the right category, nothing exempt may also be scanned,
 * and the evaluator must still flag a deliberately dirty world.
 */
export function residueScanContractProblems(): string[] {
  const problems: string[] = [];
  const runtime = new Set(getCollectionsByCategory("runtime").map(({ name }) => name));
  const reference = new Set(getCollectionsByCategory("reference").map(({ name }) => name));
  for (const name of Object.keys(RESIDUE_SCAN_RUNTIME_EXEMPT)) {
    if (!runtime.has(name)) problems.push(`runtime exemption ${name} is not a runtime collection`);
  }
  for (const name of Object.keys(RESIDUE_SCAN_REFERENCE_EXEMPT)) {
    if (!reference.has(name)) {
      problems.push(`reference exemption ${name} is not a reference collection`);
    }
  }
  for (const referenceReplaced of [true, false]) {
    const scanned = residueScanAgeCollections(referenceReplaced);
    if (scanned.length === 0) problems.push("the residue scan covers no collections");
    if (new Set(scanned).size !== scanned.length) {
      problems.push("the residue scan lists a collection twice");
    }
    for (const name of scanned) {
      if (name in RESIDUE_SCAN_RUNTIME_EXEMPT || name in RESIDUE_SCAN_REFERENCE_EXEMPT) {
        problems.push(`${name} is both exempt and scanned`);
      }
    }
  }
  const clean = {
    resetStartedAtMs: 2_000_000,
    expected: { currentTurn: 1, resetWorldId: "w" },
    gameState: {
      currentTurn: 1,
      currentYear: 2027,
      resetWorldId: "w",
      yearGuards: {},
      turnGuards: {},
      otherDocumentIds: [],
    },
    collectionAges: [],
    turnStamps: [],
    appropriations: [],
    preservedFields: [],
  };
  if (evaluateResidueScan(clean).length > 0) problems.push("the evaluator flags a clean world");
  const dirty = {
    ...clean,
    collectionAges: [{ collection: "elections", documents: [{ id: "a", createdAtMs: 1 }] }],
  };
  if (evaluateResidueScan(dirty).length === 0)
    problems.push("the evaluator misses an old document");
  return problems;
}

export interface PreflightOptions {
  mode: PreflightMode;
  /** Defaults to the 2027 full-simulation countries. */
  countries?: readonly string[];
}

export interface PreflightReport {
  findings: PreflightFinding[];
  countries: string[];
}

/** Every read below is a find, count or distinct: nothing is written. */
export async function runPreflight2027(
  db: Db,
  options: PreflightOptions
): Promise<PreflightReport> {
  const countries = [...(options.countries ?? fullSimulationCountries(PREFLIGHT_PRESET))];
  const findings: PreflightFinding[] = [];

  for (const gap of checkSeedContract(PREFLIGHT_PRESET)) {
    findings.push({
      severity: "fail",
      check: "seed-contract",
      detail: `${gap.dataset}: ${gap.detail}`,
    });
  }
  for (const problem of residueScanContractProblems()) {
    findings.push({ severity: "fail", check: "residue-scan-contract", detail: problem });
  }

  const [gameStates, characterCol, nppCol, stateCol, budgetCol] = await Promise.all([
    getGameStateCollection(db),
    getCharactersCollection(db),
    getNppsCollection(db),
    getStatesCollection(db),
    getFederalBudgetCollection(db),
  ]);
  const gameState = await gameStates.findOne({ _id: "current" });
  const states = (
    await stateCol
      .find(
        { countryId: { $in: countries as CountryId[] } },
        {
          projection: {
            countryId: 1,
            gdp: 1,
            population: 1,
            houseDistricts: 1,
            stateSenateSeats: 1,
          },
        }
      )
      .toArray()
  ).map((row): StateEvidence => ({
    id: String(row._id),
    countryId: String(row.countryId),
    gdp: row.gdp,
    population: row.population,
    houseDistricts: row.houseDistricts,
    stateSenateSeats: row.stateSenateSeats,
  }));
  const exists = { $exists: true };
  const legacyApprovals = { [LEGACY_APPROVAL_FIELD]: exists } as never;
  const [characters, npps, legislationTypes, priceIndexRows] = await Promise.all([
    characterCol.countDocuments(legacyApprovals),
    nppCol.countDocuments(legacyApprovals),
    db.collection<Document>("legislationTypes").countDocuments({
      $or: [
        { [`policyOptions.${LEGACY_APPROVAL_FIELD}`]: exists },
        { "policyOptions.groupApprovals": exists },
      ],
    }),
    budgetCol.find({ priceIndex: exists } as never, { projection: { countryId: 1 } }).toArray(),
  ]);

  findings.push(
    ...evaluatePreflight({
      mode: options.mode,
      countries,
      gameState: gameState ? { ...gameState } : null,
      states,
      seatRequirements: SEAT_FIELD_REQUIREMENTS,
      legacy: {
        charactersLegacyApprovals: characters,
        nppsLegacyApprovals: npps,
        legislationTypesLegacyApprovals: legislationTypes,
      },
      priceIndexCountries: priceIndexRows.map((row) => String(row.countryId ?? row._id)),
    })
  );
  return { findings, countries };
}
