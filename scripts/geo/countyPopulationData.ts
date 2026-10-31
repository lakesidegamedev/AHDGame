/** Census Vintage 2019 matches every FIPS in the committed county geometry. */
export const COUNTY_POPULATION_SOURCE =
  "https://www2.census.gov/programs-surveys/popest/datasets/2010-2019/counties/totals/co-est2019-alldata.csv";

/** Header-driven CSV parser: quoted names, embedded commas and CRLF are valid. */
function parsePopulationRows(
  csv: string
): { level: string; state: string; county: string; population: number }[] {
  csv = csv.replace(/^(?:\uFEFF|ï»¿)/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (quoted) throw new Error("Unterminated Census CSV quote");
  if (cell || row.length) rows.push([...row, cell.replace(/\r$/, "")]);
  const header = (rows.shift() ?? []).map((cell) => cell.trim());
  const column = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0 || header.filter((cell) => cell === name).length !== 1)
      throw new Error(`Missing or duplicate Census column ${name}`);
    return index;
  };
  const level = column("SUMLEV"),
    state = column("STATE"),
    county = column("COUNTY"),
    pop = column("POPESTIMATE2019");
  return rows
    .filter((fields) => fields[level] === "050" || fields[level] === "040")
    .map((fields) => {
      const stateCode = fields[state] ?? "",
        countyCode = fields[county] ?? "";
      const populationText = fields[pop] ?? "";
      const population = Number(populationText);
      if (
        !/^\d{1,2}$/.test(stateCode) ||
        Number(stateCode) === 0 ||
        !/^\d{1,3}$/.test(countyCode) ||
        !/^\d+$/.test(populationText) ||
        !Number.isSafeInteger(population) ||
        population <= 0 ||
        (fields[level] === "050" ? Number(countyCode) === 0 : Number(countyCode) !== 0)
      )
        throw new Error("Invalid Census population row");
      return {
        level: fields[level],
        state: stateCode.padStart(2, "0"),
        county: countyCode.padStart(3, "0"),
        population,
      };
    });
}

export function parseCountyPopulations(csv: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of parsePopulationRows(csv)) {
    if (row.level !== "050") continue;
    const fips = row.state + row.county;
    if (fips in result) throw new Error(`Duplicate Census county ${fips}`);
    result[fips] = row.population;
  }
  if (!Object.keys(result).length) throw new Error("No Census county populations");
  return result;
}

/** Validate official state checksums before any population files are replaced. */
export function parseCountyPopulationDataset(csv: string): {
  populations: Record<string, number>;
  stateTotalsByFips: Record<string, number>;
} {
  const populations = parseCountyPopulations(csv);
  const stateTotalsByFips: Record<string, number> = {};
  for (const row of parsePopulationRows(csv)) {
    if (row.level !== "040") continue;
    if (row.state in stateTotalsByFips) throw new Error(`Duplicate Census state ${row.state}`);
    stateTotalsByFips[row.state] = row.population;
  }
  const actual: Record<string, number> = {};
  for (const [fips, population] of Object.entries(populations))
    actual[fips.slice(0, 2)] = (actual[fips.slice(0, 2)] ?? 0) + population;
  const states = new Set([...Object.keys(actual), ...Object.keys(stateTotalsByFips)]);
  for (const state of states)
    if (!Number.isSafeInteger(actual[state]) || actual[state] !== stateTotalsByFips[state])
      throw new Error(`Census county/state population mismatch for ${state}`);
  return { populations, stateTotalsByFips };
}
