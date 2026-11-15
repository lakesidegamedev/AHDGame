import {
  METRICS,
  REMEDIATION,
  findRegressions,
  lowerBaseline,
  readBaseline,
  scanRepo,
  total,
  writeBaseline,
} from "./hygieneRatchet";

const mode = process.argv[2] ?? "check";
const current = scanRepo();

if (mode === "init") {
  writeBaseline(current);
  console.log("Wrote hygiene baseline.");
} else if (mode === "lower") {
  const baseline = readBaseline().metrics;
  const lowered = lowerBaseline(baseline, current);
  writeBaseline(lowered);
  for (const m of METRICS) console.log(`${m}: ${total(baseline[m])} -> ${total(lowered[m])}`);
} else if (mode === "totals") {
  for (const m of METRICS) console.log(`${m}: ${total(current[m])}`);
} else {
  const regressions = findRegressions(readBaseline().metrics, current);
  for (const r of regressions)
    console.error(`${r.metric} ${r.file}: ${r.baseline} -> ${r.current}`);
  if (regressions.length) {
    for (const m of new Set(regressions.map((r) => r.metric))) {
      console.error(`Hygiene ratchet (${m}) failed: ${REMEDIATION[m]}.`);
    }
    process.exit(1);
  }
  console.log("Hygiene ratchet ok.");
}
