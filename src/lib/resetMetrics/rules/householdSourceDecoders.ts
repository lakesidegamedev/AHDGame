/**
 * US, UK and Japanese household source decoding preserves source populations and units.
 * decodeCps1992, decodeOns1991 and decodeEstat1989 never turn missing values,
 * survey liabilities or national marginal means into current household receipts.
 */
import type { HouseholdDecodedReference, HouseholdReferenceCell } from "./householdSources";

const blankCell = (id: string, sourceArea: string): HouseholdReferenceCell => ({
  id,
  sourceArea,
  households: null,
  adults: null,
  children: null,
  marketIncome: null,
  cashTransfers: null,
  directTaxes: null,
  employeeContributions: null,
  grossIncome: null,
});

/** Census/NBER March 1992 dictionary: one-based fixed-width fields; HSUP_WGT has two decimals. */
export function decodeCps1992(lines: Iterable<string>): HouseholdDecodedReference {
  const cells: HouseholdReferenceCell[] = [];
  const gaps = new Set<string>([
    "public-private-transfer-sources-mixed",
    "estimated-tax-liabilities-not-cash",
    "tax-credits-and-filing-units-not-resolved",
  ]);
  const sequences = new Set<number>();
  let current:
    | {
        sequence: number;
        people: number;
        seen: number;
        positions: Set<number>;
        cell: HouseholdReferenceCell;
      }
    | undefined;
  const number = (line: string, start: number, width: number) => {
    const text = line.slice(start - 1, start - 1 + width);
    if (text.length !== width || !/^-?\d+$/.test(text.trim()))
      throw new Error("Invalid CPS numeric field");
    return Number(text);
  };
  const finish = () => {
    if (!current) return;
    if (current.people !== current.seen) gaps.add("household-person-count-mismatch");
    if (current.people < 1 || current.cell.households! < 0)
      gaps.add("invalid-household-weight-or-composition");
    if (current.cell.households === 0) gaps.add("zero-weight-records-require-explicit-exclusion");
    if (current.cell.grossIncome! < 0) gaps.add("signed-reference-income");
    cells.push(current.cell);
  };
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;
    if (line[0] === "1") {
      finish();
      current = undefined;
      const people = number(line, 21, 2),
        weight = number(line, 287, 8) / 100;
      // Vacant/nonresident records are outside the household-resident universe.
      // Never remove a resident record merely because its income or weight is invalid.
      if (people === 0 && weight === 0) continue;
      const children = number(line, 279, 2);
      const cell = blankCell(`h${cells.length + 1}`, String(number(line, 40, 2)));
      Object.assign(cell, {
        households: weight,
        adults: people - children,
        children,
        grossIncome: number(line, 248, 8),
        directTaxes: 0,
        employeeContributions: 0,
      });
      const categories = [
        "wages",
        "self-employment",
        "farm",
        "unemployment",
        "workers-compensation",
        "social-security",
        "supplemental-security",
        "public-assistance",
        "veterans",
        "survivors",
        "disability",
        "retirement",
        "interest",
        "dividends",
        "rent",
        "education-assistance",
        "child-support",
        "alimony",
        "financial-assistance",
        "other",
      ];
      const starts = [
        91, 99, 107, 115, 123, 131, 139, 146, 153, 161, 169, 177, 185, 193, 201, 209, 217, 225, 233,
        241,
      ];
      cell.reportedIncomeComponents = Object.fromEntries(
        categories.map((name, i) => [name, number(line, starts[i]!, i === 6 || i === 7 ? 6 : 7)])
      );
      // Match the game's wages-and-salaries payroll base, not pensions or capital income.
      cell.labourIncome = cell.reportedIncomeComponents.wages;
      if (
        Object.values(cell.reportedIncomeComponents).reduce((s, v) => s + v, 0) !== cell.grossIncome
      )
        gaps.add("reported-income-total-mismatch");
      if (children < 0 || children > people) gaps.add("invalid-household-weight-or-composition");
      const sequence = number(line, 2, 5);
      if (sequences.has(sequence)) gaps.add("duplicate-household-sequence");
      sequences.add(sequence);
      current = { sequence, people, seen: 0, positions: new Set(), cell };
    } else if (line[0] === "3") {
      if (!current) throw new Error("CPS person has no resident household");
      if (number(line, 2, 5) !== current.sequence)
        throw new Error("CPS person belongs to another household");
      current.seen++;
      const position = number(line, 7, 2);
      if (current.positions.has(position)) gaps.add("duplicate-person-position");
      current.positions.add(position);
      // Retain dictionary totals as estimates, not qualified settled deductions.
      current.cell.directTaxes! += number(line, 660, 5) + number(line, 669, 5);
      current.cell.employeeContributions! += number(line, 674, 5) + number(line, 679, 5);
    } else if (line[0] !== "2") throw new Error("Unknown CPS record type");
  }
  finish();
  if (!cells.length) throw new Error("CPS reference contains no households");
  return {
    version: 1,
    countryId: "US",
    sourceId: "cps-asec-1992-income-1991",
    incomeYear: 1991,
    currency: "USD",
    population: "all-household-residents",
    distribution: "joint-household-groups",
    gaps: [...gaps],
    cells,
  };
}

type SourceValue = string | number | boolean | null;
/** ONS historical all-household decile worksheet, source values only; never infer population weights from sample counts. */
export function decodeOns1991(
  grid: readonly (readonly SourceValue[])[]
): HouseholdDecodedReference {
  if (!String(grid[0]?.[0]).includes("1991") || !String(grid[0]?.[0]).includes("ALL households"))
    throw new Error("Expected the ONS 1991 all-household decile worksheet");
  const row = (label: string) => {
    const matches = grid.filter((r) => String(r[0] ?? "").trim() === label);
    if (matches.length !== 1) throw new Error(`ONS row missing or ambiguous: ${label}`);
    return matches[0]!;
  };
  const value = (r: readonly SourceValue[], column: number): number | null =>
    typeof r[column] === "number" && Number.isFinite(r[column]) ? (r[column] as number) : null;
  const sample = row("Number of households in the sample"),
    gross = row("Gross income");
  const benefits = row("Total cash benefits"),
    incomeTax = row("Income Tax");
  const relief = row("less: Tax relief at source3"),
    contributions = row("Employees' NI contributions");
  const rates = row("Community charge/Domestic rates (gross)");
  const inKind = row("Imputed income from benefits in kind");
  const incomeRows = [
    "Wages and salaries",
    "Self-employment income",
    "Private pensions, annuities2",
    "Investment income",
    "Other income",
  ].map(row);
  const cells = Array.from({ length: 10 }, (_, i) => {
    const c = i + 1,
      cell = blankCell(`decile-${c}`, "UK");
    const original = incomeRows.map((r) => value(r, c));
    const tax = value(incomeTax, c),
      taxRelief = value(relief, c),
      localRates = value(rates, c);
    cell.sampleHouseholds = value(sample, c) ?? undefined;
    cell.grossIncome = value(gross, c);
    // Employer benefits in kind are explicitly excluded from the cash owner.
    cell.marketIncome = original.every((n) => n !== null)
      ? original.reduce<number>((s, n) => s + n!, 0)
      : null;
    cell.cashTransfers = value(benefits, c);
    cell.directTaxes =
      tax !== null && taxRelief !== null && localRates !== null
        ? tax - taxRelief + localRates
        : null;
    cell.employeeContributions = value(contributions, c);
    cell.labourIncome = value(incomeRows[0]!, c) ?? undefined;
    // Reading the row is mandatory to ensure the original/gross definition is understood.
    if (value(inKind, c) === null) throw new Error("Missing ONS in-kind component");
    return cell;
  });
  return {
    version: 1,
    countryId: "UK",
    sourceId: "ons-effects-taxes-benefits-1991",
    incomeYear: 1991,
    currency: "GBP",
    population: "all-household-residents",
    distribution: "marginal-means",
    gaps: [
      "national-marginals-not-regional-joint-distribution",
      "missing-population-weights",
      "missing-joint-composition",
    ],
    cells,
  };
}

const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .trim();
/** e-Stat public table 0000110274, normal viewer JSON. Symbol cells remain missing, not zero. */
export function decodeEstat1989(input: {
  tableId: string;
  requestData: {
    colItemList1?: string;
    etcDispTableNm1?: string;
    etcDispTableNm3?: string;
    etcItem1?: string;
    etcItem2?: string;
    etcItem3?: string;
  };
  table: string;
}): HouseholdDecodedReference {
  if (
    input.tableId !== "0000110274" ||
    input.table.length > 5_000_000 ||
    input.requestData.etcDispTableNm1 !== "S4AR8_0000110274_BUN01" ||
    input.requestData.etcDispTableNm3 !== "S4AR8_0000110274_TIME" ||
    !["1", "2"].includes(input.requestData.etcItem1 ?? "") ||
    input.requestData.etcItem2 !== "001" ||
    input.requestData.etcItem3 !== "1989000000"
  )
    throw new Error("Unsupported e-Stat household table");
  const headers = [
    ...input.table.matchAll(
      /<th\b[^>]*class="[^"]*js-dbview-cols\b[^"]*"[^>]*data-unique="([^"]+)"[^>]*>([\s\S]*?)<\/th>/g
    ),
  ];
  const codes = headers.map((m) => m[1]!);
  const requested = input.requestData.colItemList1?.split(",") ?? [];
  if (
    !codes.length ||
    codes.some((c) => !requested.includes(c)) ||
    new Set(codes).size !== codes.length
  )
    throw new Error("Invalid e-Stat column identity");
  const cells: HouseholdReferenceCell[] = [];
  for (const row of input.table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const region = row[1]!.match(/class="[^"]*js-dbview-rows[^"]*"[^>]*data-unique="([^"]+)"/);
    if (!region) continue;
    const raw = [...row[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => textOf(m[1]!));
    if (raw.length !== codes.length) throw new Error("Truncated e-Stat row");
    const get = (code: string) => {
      const i = codes.indexOf(code),
        v = i < 0 ? "" : raw[i]!.replace(/,/g, "");
      return /^-?\d+(?:\.\d+)?$/.test(v) ? Number(v) : null;
    };
    const cell = blankCell(`tenure-mean-${region[1]}`, region[1]!);
    cell.meanHouseholdSize = get("004") ?? undefined;
    cell.sampleHouseholds = get("001") ?? undefined;
    // Annual income is thousand yen; the remaining fiscal fields are monthly yen.
    const annual = get("011");
    cell.grossIncome = annual === null ? null : annual * 1000;
    const cash = get("038"),
      tax = get("201"),
      insurance = get("205");
    cell.cashTransfers = cash === null ? null : cash * 12;
    cell.directTaxes = tax === null ? null : tax * 12;
    cell.employeeContributions = insurance === null ? null : insurance * 12;
    cells.push(cell);
  }
  if (!cells.length || new Set(cells.map((c) => c.sourceArea)).size !== cells.length)
    throw new Error("Missing or duplicated e-Stat regional rows");
  return {
    version: 1,
    countryId: "JP",
    sourceId: "nsfie-1989-regional-tenure",
    incomeYear: 1989,
    currency: "JPY",
    population: input.requestData.etcItem1 === "2" ? "workers-only" : "multi-person-only",
    distribution: "marginal-means",
    gaps: [
      "single-person-households-not-covered",
      "regional-tenure-means-not-joint-households",
      "incomplete-income-components",
    ],
    cells,
  };
}
