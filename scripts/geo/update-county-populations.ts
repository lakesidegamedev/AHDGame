/** Refresh population only, preserving geometry and partisan leans. Usage: tsx scripts/geo/update-county-populations.ts <Census CSV> */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { COUNTY_POPULATION_SOURCE, parseCountyPopulationDataset } from "./countyPopulationData";
async function main() {
  if (!process.argv[2]) throw new Error("Supply the Census Vintage 2019 CSV path");
  const bytes = await readFile(process.argv[2]);
  const { populations, stateTotalsByFips } = parseCountyPopulationDataset(bytes.toString("latin1"));
  const dir = join(process.cwd(), "src/data/counties");
  const files = await Promise.all(
    (await readdir(dir))
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        const doc = JSON.parse(await readFile(join(dir, f), "utf8")) as {
          counties: { fips: string; population: number }[];
        };
        for (const c of doc.counties) {
          if (!(c.fips in populations)) throw new Error(`Missing Census population for ${c.fips}`);
          c.population = populations[c.fips];
        }
        return { file: join(dir, f), doc };
      })
  );
  const ids = files.flatMap((f) => f.doc.counties.map((c) => c.fips));
  if (new Set(ids).size !== ids.length || ids.length !== Object.keys(populations).length)
    throw new Error("Census population roster does not match the committed county geometry");
  for (const { file, doc } of files) await writeFile(file, JSON.stringify(doc));
  await writeFile(
    join(process.cwd(), "src/data/county-population-source.json"),
    JSON.stringify(
      {
        source: COUNTY_POPULATION_SOURCE,
        vintage: 2019,
        field: "POPESTIMATE2019",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        countyCount: ids.length,
        stateTotalsByFips,
      },
      null,
      2
    ) + "\n"
  );
  console.log(
    JSON.stringify({
      source: COUNTY_POPULATION_SOURCE,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      count: files.reduce((n, f) => n + f.doc.counties.length, 0),
    })
  );
}
void main();
