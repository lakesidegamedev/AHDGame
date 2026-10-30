/** Census Vintage 2019 matches every FIPS in the committed county geometry. */
export const COUNTY_POPULATION_SOURCE =
  "https://www2.census.gov/programs-surveys/popest/datasets/2010-2019/counties/totals/co-est2019-alldata.csv";

/** Header-driven CSV parser: quoted names, embedded commas and CRLF are valid. */
export function parseCountyPopulations(csv: string): Record<string, number> {
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
  const header = rows.shift() ?? [];
  const column = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Missing Census column ${name}`);
    return index;
  };
  const level = column("SUMLEV"),
    state = column("STATE"),
    county = column("COUNTY"),
    pop = column("POPESTIMATE2019");
  const result: Record<string, number> = {};
  for (const fields of rows) {
    if (fields[level] !== "050") continue;
    const fips = `${fields[state]?.padStart(2, "0") ?? ""}${fields[county]?.padStart(3, "0") ?? ""}`;
    const population = Number(fields[pop]);
    if (
      !/^\d{5}$/.test(fips) ||
      !Number.isSafeInteger(population) ||
      population <= 0 ||
      fips in result
    )
      throw new Error(`Invalid or duplicate Census county ${fips}`);
    result[fips] = population;
  }
  if (!Object.keys(result).length) throw new Error("No Census county populations");
  return result;
}
