/** Offline source decoding only. No configured database is opened and no player data is read. */
import { openSync, readSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  decodeCps1992,
  decodeOns1991,
  decodeEstat1989,
} from "../../src/lib/resetMetrics/rules/householdSourceDecoders";
import type { HouseholdDecodedReference } from "../../src/lib/resetMetrics/rules/householdSources";

const option = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = option("out");
const outputRelative = out ? path.relative(process.cwd(), out) : "";
if (
  !out ||
  !path.isAbsolute(out) ||
  (!path.isAbsolute(outputRelative) && !outputRelative.startsWith(`..${path.sep}`))
)
  throw new Error("Provide --out= with an absolute diagnostic path outside the repository");

const sourceHashes: Record<string, string> = {};
function* sourceLines(file: string): Generator<string> {
  const fd = openSync(file, "r"),
    buffer = Buffer.alloc(64 * 1024),
    hash = createHash("sha256");
  let tail = "";
  try {
    let count;
    while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      const chunk = buffer.subarray(0, count);
      hash.update(chunk);
      const lines = (tail + chunk.toString("ascii")).split("\n");
      tail = lines.pop()!;
      yield* lines;
    }
    if (tail) yield tail;
    sourceHashes.US = hash.digest("hex");
  } finally {
    closeSync(fd);
  }
}
const references: HouseholdDecodedReference[] = [];
const us = option("us");
if (us) references.push(decodeCps1992(sourceLines(us)));
for (const [country, decoder] of [
  ["uk", decodeOns1991],
  [
    "jp",
    (data: Parameters<typeof decodeEstat1989>[0]) =>
      decodeEstat1989({ ...data, tableId: "0000110274" }),
  ],
] as const) {
  const file = option(country);
  if (!file) continue;
  const bytes = readFileSync(file);
  sourceHashes[country.toUpperCase()] = createHash("sha256").update(bytes).digest("hex");
  // The UK file is the values-only intermediate from the bundled workbook reader.
  const data = JSON.parse(bytes.toString("utf8"));
  references.push(decoder(data));
}
if (!references.length) throw new Error("Provide at least one --us=, --uk= or --jp= source file");
const summary = references.map((r) => ({
  countryId: r.countryId,
  cells: r.cells.length,
  sourceAreas: new Set(r.cells.map((c) => c.sourceArea)).size,
  incomeYear: r.incomeYear,
  gaps: r.gaps,
  activation: "not-performed",
}));
writeFileSync(
  out,
  JSON.stringify({
    scope: "Decoded historical source references, not current game receipts or a live migration",
    sourceHashes,
    summary,
    references,
  })
);
console.log(JSON.stringify({ sourceHashes, summary }));
