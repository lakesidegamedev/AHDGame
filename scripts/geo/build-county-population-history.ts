/** Rebuild audited county snapshots from downloaded Census inputs. No network or database writes.
 * tsx scripts/geo/build-county-population-history.ts <input-directory>
 * Required input filenames and URLs are recorded below and in the generated artifact.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { format, resolveConfig } from "prettier";
import { parseCountyPopulationDataset } from "./countyPopulationData";
import {
  parseDecennialCounties,
  parseIntercensalCounties,
  parse1979Counties,
  reconcileCountyHistory,
} from "./countyPopulationHistoryData";

const sources = [
  {
    year: 1950,
    file: "decennial",
    url: "https://data.nber.org/census/population/cencounts/1900-90.txt",
    original: "https://www.census.gov/population/www/censusdata/cencounts/files/1900-90.txt",
    field: "1950 Census",
    kind: "decennial",
  },
  {
    year: 1979,
    file: "annual1979-e7079co.txt",
    url: "https://www2.census.gov/programs-surveys/popest/tables/1900-1980/counties/totals/e7079co.zip",
    field: "1979 July estimate (rounded preliminary series)",
    kind: "1979",
  },
  ...[1991, 1999].map((year) => ({
    year,
    file: `annual${year}`,
    url: `https://www2.census.gov/programs-surveys/popest/tables/1990-2000/intercensal/st-co/stch-icen${year}.txt`,
    field: "Sum of disjoint age/race-sex/origin cells",
    kind: "intercensal",
  })),
  {
    year: 2007,
    file: "pep2009",
    url: "https://www2.census.gov/programs-surveys/popest/datasets/2000-2009/counties/totals/co-est2009-alldata.csv",
    field: "POPESTIMATE2007",
    kind: "csv",
  },
  ...[2023, 2025].map((year) => ({
    year,
    file: "pep2025",
    url: "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/totals/co-est2025-alldata.csv",
    field: `POPESTIMATE${year}`,
    kind: "csv",
  })),
];
async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Provide the Census input directory");
  const roster: string[] = [];
  for (const file of (await readdir("src/data/counties"))
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const data = JSON.parse(await readFile(join("src/data/counties", file), "utf8")) as {
      counties: { fips: string }[];
    };
    roster.push(...data.counties.map((c) => c.fips));
  }
  const snapshots: Record<string, unknown> = {};
  for (const source of sources) {
    const bytes = await readFile(join(input, source.file));
    const text = bytes.toString("latin1");
    const populations =
      source.kind === "decennial"
        ? parseDecennialCounties(text, source.year)
        : source.kind === "1979"
          ? parse1979Counties(text)
          : source.kind === "intercensal"
            ? parseIntercensalCounties(text, source.year)
            : parseCountyPopulationDataset(text, source.field).populations;
    const reconciled = reconcileCountyHistory(populations, roster);
    snapshots[source.year] = {
      source: source.url,
      ...("original" in source ? { originalSource: source.original } : {}),
      inputFile: source.file,
      field: source.field,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      hashScope: source.kind === "1979" ? "Uncompressed e7079co.txt" : "Raw input file",
      sourceCountyCount: Object.keys(populations).filter((id) => !id.endsWith("000")).length,
      historicalCountyCount: Object.keys(reconciled.populations).length,
      ...reconciled,
    };
    console.log(
      `${source.year}: ${Object.keys(reconciled.populations).length} matched counties; fallback states ${Object.keys(reconciled.fallbackStates).join(",")}`
    );
  }
  const target = "src/lib/countries/us/data/countyPopulationHistory.json";
  const output = {
    note: "Census counts/estimates keyed to fixed game geography. Whole-entity aliases follow Census county-change notices. Incompatible state rosters use proportional 2019 fallback; these are not boundary-crosswalk estimates.",
    countyChangesSource:
      "https://www.census.gov/programs-surveys/geography/technical-documentation/county-changes.html",
    snapshots,
  };
  await writeFile(
    target,
    await format(JSON.stringify(output), {
      ...(await resolveConfig(target)),
      parser: "json",
    })
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
