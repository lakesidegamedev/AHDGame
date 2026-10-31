/**
 * County populations start from Census weights scaled to the world's state totals.
 * seedCountyPopulations preserves existing stocks on migration and replaces them
 * on a world reset, so modern reference headcounts never overwrite a historical world.
 */
import type { Db } from "mongodb";
import type { County } from "@/lib/db/types/county";
import { apportionPopulation, countyBaselineYear, selectCountyPopulationBaseline } from "./rules";
import { historicalCountyWeights } from "./historical";
import { loadCountyReference } from "./reference";

export async function seedCountyPopulations(
  db: Db,
  options: { apply?: boolean; replace?: boolean; preset?: string } = {}
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
  const states = await db
    .collection<{ _id: string; population: number }>("states")
    .find({ countryId: "US" }, { projection: { _id: 1, population: 1 } })
    .toArray();
  const groups = await Promise.all(
    states.map(async (state) => {
      const reference = await loadCountyReference(state._id);
      const baseline = selectCountyPopulationBaseline(
        reference.map((c) => ({ id: c.fips, population: c.population })),
        historicalCountyWeights(reference[0]?.fips.slice(0, 2), year),
        year
      );
      const allocated = apportionPopulation(baseline.weights, state.population);
      return reference.map((c, i): County => ({
        _id: c.fips,
        stateId: state._id,
        countryId: "US",
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
      { $or: [{ countryId: "US" }, { _id: { $in: rows.map((c) => c._id) } }] },
      { projection: { _id: 1, countryId: 1, stateId: 1, population: 1 } }
    )
    .toArray();
  if (
    existing.some(
      (row) =>
        row.countryId !== "US" ||
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
  if (options.replace) await db.collection<County>("counties").deleteMany({ countryId: "US" });
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
    .find({ countryId: "US" }, { projection: { _id: 1, stateId: 1, population: 1 } })
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
