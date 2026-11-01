/**
 * Subdivision populations start from dated reference weights scaled to region totals.
 * seedCountyPopulations preserves existing stocks on migration and replaces them
 * on a world reset, so modern reference headcounts never overwrite a historical world.
 */
import type { Db } from "mongodb";
import type { County } from "@/lib/db/types/county";
import {
  apportionPopulation,
  countyBaselineYear,
  selectCountyPopulationBaseline,
  COUNTY_COUNTRY_IDS,
  type CountyCountryId,
} from "./rules";
import { historicalCountyWeights } from "./historical";
import {
  hasPopulationSubdivisionReference,
  loadPopulationSubdivisionReference,
  referencePopulationBaseline,
} from "./subdivisionReference";

export async function seedCountyPopulations(
  db: Db,
  options: {
    apply?: boolean;
    replace?: boolean;
    preset?: string;
    countryIds?: readonly CountyCountryId[];
  } = {}
): Promise<number> {
  // Bootstrap knows the requested era before a direct caller stamps gameState.
  const preset =
    options.preset ??
    (
      await db
        .collection<{ _id: string; preset?: string }>("gameState")
        .findOne({ _id: "current" }, { projection: { preset: 1 } })
    )?.preset;
  const year = countyBaselineYear(preset);
  const countryIds = options.countryIds ?? COUNTY_COUNTRY_IDS;
  const states = (
    await db
      .collection<{ _id: string; countryId: CountyCountryId; population: number }>("states")
      .find(
        { countryId: { $in: [...countryIds] } },
        { projection: { _id: 1, countryId: 1, population: 1 } }
      )
      .toArray()
  ).filter((state) => hasPopulationSubdivisionReference(state._id, state.countryId));
  const groups = await Promise.all(
    states.map(async (state) => {
      const reference = await loadPopulationSubdivisionReference(state._id, state.countryId);
      const baseline =
        state.countryId === "US"
          ? selectCountyPopulationBaseline(
              reference.map((c) => ({ id: c.id, population: c.population })),
              historicalCountyWeights(reference[0]?.id.slice(0, 2), year),
              year
            )
          : {
              weights: reference.map((c) => ({ id: c.id, population: c.population })),
              populationBaseline: referencePopulationBaseline(state.countryId),
            };
      const allocated = apportionPopulation(baseline.weights, state.population);
      return reference.map((c, i): County => ({
        _id: c.id,
        stateId: state._id,
        countryId: state.countryId,
        name: c.name,
        population: allocated[i].population,
        baselinePopulation: baseline.weights[i].population,
        populationBaseline: baseline.populationBaseline,
      }));
    })
  );
  const rows = groups.flat();
  const expectedById = new Map(rows.map((row) => [row._id, row]));
  const existing = await db
    .collection<County>("counties")
    .find(
      { $or: [{ countryId: { $in: [...countryIds] } }, { _id: { $in: rows.map((c) => c._id) } }] },
      { projection: { _id: 1, countryId: 1, stateId: 1, population: 1 } }
    )
    .toArray();
  if (
    existing.some(
      (row) =>
        !countryIds.includes(row.countryId) ||
        (expectedById.has(row._id) && expectedById.get(row._id)!.countryId !== row.countryId) ||
        (!options.replace &&
          (!expectedById.has(row._id) ||
            expectedById.get(row._id)!.stateId !== row.stateId ||
            !Number.isSafeInteger(row.population) ||
            row.population < 0))
    )
  )
    throw new Error("Unexpected or invalid existing county stock");
  const prospective = new Map(rows.map((row) => [row._id, row.population]));
  if (!options.replace) for (const row of existing) prospective.set(row._id, row.population);
  for (const state of states) {
    const sum = rows
      .filter((row) => row.stateId === state._id)
      .reduce((n, row) => n + prospective.get(row._id)!, 0);
    if (sum !== state.population)
      throw new Error(
        `County population mismatch for ${state._id}; stop demographic turns before initializing counties`
      );
  }
  if (options.apply === false) return rows.length;
  if (options.replace)
    await db.collection<County>("counties").deleteMany({ countryId: { $in: [...countryIds] } });
  if (rows.length)
    await db.collection<County>("counties").bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: { _id: row._id },
          update: { $setOnInsert: row },
          upsert: true,
        },
      })),
      { ordered: true }
    );
  const persisted = await db
    .collection<County>("counties")
    .find(
      { countryId: { $in: [...countryIds] } },
      { projection: { _id: 1, stateId: 1, population: 1 } }
    )
    .toArray();
  for (const state of states) {
    const actual = persisted.filter((c) => c.stateId === state._id);
    const expected = rows.filter((c) => c.stateId === state._id);
    if (
      actual.length !== expected.length ||
      actual.reduce((n, c) => n + c.population, 0) !== state.population
    )
      throw new Error(
        `County population mismatch for ${state._id}; stop demographic turns before initializing counties`
      );
  }
  return rows.length;
}
