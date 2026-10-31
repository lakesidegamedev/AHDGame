import { afterEach, describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const owned: string[] = [];
const csv =
  "SUMLEV,STATE,COUNTY,POPESTIMATE2019\r\n040,01,000,5\r\n050,01,001,2\r\n050,01,003,3\r\n";
function fixture(input = csv) {
  const cwd = mkdtempSync(join(tmpdir(), "ahd-county-refresh-"));
  owned.push(cwd);
  mkdirSync(join(cwd, "src/data/counties"), { recursive: true });
  const doc = {
    viewBox: "0 0 1 1",
    counties: [
      { fips: "01001", population: 99, path: "M0 0", cookPVI: 2 },
      { fips: "01003", population: 99, path: "M1 1", cookPVI: -2 },
    ],
  };
  writeFileSync(join(cwd, "src/data/counties/AL.json"), JSON.stringify(doc));
  writeFileSync(join(cwd, "source.csv"), input);
  return { cwd, doc };
}
function run(cwd: string) {
  return spawnSync(
    process.execPath,
    [
      resolve("node_modules/tsx/dist/cli.mjs"),
      resolve("scripts/geo/update-county-populations.ts"),
      join(cwd, "source.csv"),
    ],
    { cwd, encoding: "utf8" }
  );
}
afterEach(() => {
  for (const cwd of owned.splice(0)) rmSync(cwd, { recursive: true, force: true });
});
describe("county refresh CLI", () => {
  it("updates populations and provenance together while preserving geometry", () => {
    const { cwd, doc } = fixture();
    const result = run(cwd);
    expect(result.status, result.stderr).toBe(0);
    const updated = JSON.parse(readFileSync(join(cwd, "src/data/counties/AL.json"), "utf8"));
    expect(updated).toEqual({
      ...doc,
      counties: doc.counties.map((c, i) => ({ ...c, population: i === 0 ? 2 : 3 })),
    });
    expect(
      JSON.parse(readFileSync(join(cwd, "src/data/county-population-source.json"), "utf8"))
    ).toMatchObject({
      vintage: 2019,
      field: "POPESTIMATE2019",
      countyCount: 2,
      stateTotalsByFips: { "01": 5 },
      sha256: createHash("sha256").update(csv).digest("hex"),
    });
  });
  it("fails before replacing files when official checksums disagree", () => {
    const { cwd, doc } = fixture(csv.replace("000,5", "000,6"));
    const result = run(cwd);
    expect(result.status).not.toBe(0);
    expect(JSON.parse(readFileSync(join(cwd, "src/data/counties/AL.json"), "utf8"))).toEqual(doc);
  });
  it("rejects a changed county roster instead of silently dropping extra counties", () => {
    const { cwd, doc } = fixture(csv.replace("000,5", "000,6") + "050,01,005,1\r\n");
    const result = run(cwd);
    expect(result.status).not.toBe(0);
    expect(JSON.parse(readFileSync(join(cwd, "src/data/counties/AL.json"), "utf8"))).toEqual(doc);
  });
});
