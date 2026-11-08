import {
  findRegressions,
  lowerBaseline,
  readBaseline,
  scanRepo,
  totals,
  writeBaseline,
} from "./dataAccessRatchet";

const mode = process.argv[2] ?? "check";
const current = scanRepo();

if (mode === "init") {
  writeBaseline(current);
  console.log(`Wrote baseline for ${Object.keys(current).length} files.`);
} else if (mode === "lower") {
  const baseline = readBaseline().files;
  const lowered = lowerBaseline(baseline, current);
  writeBaseline(lowered);
  const before = totals(baseline);
  const after = totals(lowered);
  for (const metric of Object.keys(before).sort())
    console.log(`${metric}: ${before[metric]} -> ${after[metric] ?? 0}`);
} else if (mode === "totals") {
  console.log(JSON.stringify(totals(current), null, 2));
} else {
  const regressions = findRegressions(readBaseline().files, current);
  for (const r of regressions)
    console.error(`${r.file}: ${r.metric} ${r.baseline} -> ${r.current}`);
  if (regressions.length) {
    console.error(
      "Data access ratchet failed: use the typed getter in src/lib/db/collections, and give every .collection() call a document type."
    );
    process.exit(1);
  }
  console.log("Data access ratchet ok.");
}
