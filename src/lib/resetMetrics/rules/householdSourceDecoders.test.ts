import { describe, expect, it } from "vitest";
import { decodeCps1992, decodeOns1991, decodeEstat1989 } from "./householdSourceDecoders";

function cpsRecord(type: string, values: [number, number, number][]) {
  const line = Array<string>(700).fill(" ");
  line[0] = type;
  for (const [start, width, value] of values)
    line.splice(start - 1, width, ...String(value).padStart(width, " "));
  return line.join("");
}
const household = (gross = 100) =>
  cpsRecord("1", [
    ...[
      91, 99, 107, 115, 123, 131, 139, 146, 153, 161, 169, 177, 185, 193, 201, 209, 217, 225, 233,
      241,
    ].map((start, i): [number, number, number] => [
      start,
      i === 6 || i === 7 ? 6 : 7,
      start === 99 ? gross : 0,
    ]),
    [2, 5, 1],
    [21, 2, 1],
    [40, 2, 11],
    [248, 8, gross],
    [279, 2, 0],
    [287, 8, 123],
  ]);
const person = () =>
  cpsRecord("3", [
    [2, 5, 1],
    [7, 2, 1],
    [660, 5, 10],
    [669, 5, 2],
    [674, 5, 3],
    [679, 5, 1],
  ]);

describe("historical household source decoding", () => {
  it("decodes CPS weights and household/person records without calling estimates paid cash", () => {
    const result = decodeCps1992([household(), person()]);
    expect(result.cells[0]).toMatchObject({
      households: 1.23,
      adults: 1,
      children: 0,
      sourceArea: "11",
      grossIncome: 100,
      directTaxes: 12,
      employeeContributions: 4,
      marketIncome: null,
      cashTransfers: null,
    });
    expect(result.gaps).toContain("estimated-tax-liabilities-not-cash");
  });
  it("retains signed reference income and flags it instead of dropping the household", () => {
    const result = decodeCps1992([household(-100), person()]);
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0]!.grossIncome).toBe(-100);
    expect(result.gaps).toContain("signed-reference-income");
  });
  it("rejects malformed fields and household membership", () => {
    expect(() => decodeCps1992(["1"])).toThrow("numeric field");
    expect(() => decodeCps1992([person()])).toThrow("no resident household");
    expect(() => decodeCps1992([household(), person().replace(/^3    1/, "3    2")])).toThrow(
      "another household"
    );
  });
  it("flags duplicate household/person records without silently selecting one", () => {
    expect(decodeCps1992([household(), person(), person()]).gaps).toContain(
      "duplicate-person-position"
    );
    expect(decodeCps1992([household(), person(), household(), person()]).gaps).toContain(
      "duplicate-household-sequence"
    );
    expect(decodeCps1992([household()]).gaps).toContain("household-person-count-mismatch");
  });
  const ons = () => {
    const labels: [string, number][] = [
      ["Number of households in the sample", 705],
      ["Gross income", 527],
      ["Total cash benefits", 20],
      ["Income Tax", 10],
      ["less: Tax relief at source3", 2],
      ["Employees' NI contributions", 5],
      ["Community charge/Domestic rates (gross)", 3],
      ["Imputed income from benefits in kind", 7],
      ...[
        "Wages and salaries",
        "Self-employment income",
        "Private pensions, annuities2",
        "Investment income",
        "Other income",
      ].map((s): [string, number] => [s, 100]),
    ];
    return [
      ["Average incomes, taxes and benefits by decile groups of ALL households, 1991"],
      ...labels.map(([label, v]) => [label, ...Array<number>(10).fill(v)]),
    ];
  };
  it("decodes ONS cash components, excluding in-kind benefits and sample/population confusion", () => {
    const result = decodeOns1991(ons());
    expect(result.cells).toHaveLength(10);
    expect(result.cells[0]).toMatchObject({
      marketIncome: 500,
      cashTransfers: 20,
      directTaxes: 11,
      employeeContributions: 5,
      households: null,
      sampleHouseholds: 705,
      adults: null,
    });
    expect(result.distribution).toBe("marginal-means");
  });
  it("rejects ONS wrong vintage and duplicated labels", () => {
    const data = ons();
    data[0]![0] = "1994";
    expect(() => decodeOns1991(data)).toThrow("1991");
    const dup = ons();
    dup.push(dup[1]!);
    expect(() => decodeOns1991(dup)).toThrow("ambiguous");
  });
  function estat() {
    const codes = ["001", "004", "011", "038", "201", "205"];
    return {
      tableId: "0000110274",
      requestData: {
        colItemList1: codes.join(","),
        etcDispTableNm1: "S4AR8_0000110274_BUN01",
        etcDispTableNm3: "S4AR8_0000110274_TIME",
        etcItem1: "1",
        etcItem2: "001",
        etcItem3: "1989000000",
      },
      table: `<table><tr>${codes.map((c) => `<th class="js-dbview-cols" data-unique="${c}">${c}</th>`).join("")}</tr><tr><th class="js-dbview-rows" data-unique="00042">Region</th>${["100", "3.77", "6,653", "-", "0", "123"].map((v) => `<td>${v}</td>`).join("")}</tr></table>`,
    };
  }
  it("decodes Japan mixed yen periods, keeps suppressed/missing cells missing and zero real", () => {
    const result = decodeEstat1989(estat());
    expect(result.cells[0]).toMatchObject({
      meanHouseholdSize: 3.77,
      grossIncome: 6_653_000,
      cashTransfers: null,
      directTaxes: 0,
      employeeContributions: 1476,
      households: null,
    });
    expect(result.population).toBe("multi-person-only");
  });
  it("distinguishes worker-only tables and rejects wrong date, tenure, or column identity", () => {
    const workers = estat();
    workers.requestData.etcItem1 = "2";
    expect(decodeEstat1989(workers).population).toBe("workers-only");
    for (const key of ["etcItem2", "etcItem3", "colItemList1"] as const) {
      const data = estat();
      data.requestData[key] = "wrong";
      expect(() => decodeEstat1989(data)).toThrow();
    }
  });
  it.each([
    "<script>6653</script>",
    "<scr<script>ipt>6653",
    "<script",
    "<b>6</b>653",
    "<span>6,653</span>",
    "&lt;script&gt;6653",
    "6<!-- note -->653",
    "6,,653",
    "66,53",
    "6,653 trailing",
    "",
    "&nbsp;",
    "9".repeat(400),
  ])("keeps nonnumeric e-Stat content missing instead of stripping it: %s", (content) => {
    const data = estat();
    data.table = data.table.replace("<td>6,653</td>", `<td>${content}</td>`);
    expect(decodeEstat1989(data).cells[0]!.grossIncome).toBeNull();
  });
  it.each([
    ["\n 6,653\r\n", 6_653_000],
    ["&nbsp;6,653&#160;", 6_653_000],
    ["6653", 6_653_000],
    ["0", 0],
    ["-1.25", -1250],
  ] as const)("decodes only complete numeric e-Stat cells: %s", (content, expected) => {
    const data = estat();
    data.table = data.table.replace("<td>6,653</td>", `<td>${content}</td>`);
    expect(decodeEstat1989(data).cells[0]!.grossIncome).toBe(expected);
  });
});
