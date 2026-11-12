import {
  findRegressions,
  lowerBaseline,
  readBaseline,
  scanRepo,
  total,
  writeBaseline,
} from "./archetypeRatchet";

const mode = process.argv[2] ?? "check";
const current = scanRepo();

if (mode === "init") {
  writeBaseline(current);
  console.log(`Wrote baseline for ${Object.keys(current).length} files.`);
} else if (mode === "lower") {
  const baseline = readBaseline().files;
  const lowered = lowerBaseline(baseline, current);
  writeBaseline(lowered);
  console.log(`archetype hits: ${total(baseline)} -> ${total(lowered)}`);
} else if (mode === "totals") {
  console.log(total(current));
} else {
  const regressions = findRegressions(readBaseline().files, current);
  for (const r of regressions) console.error(`${r.file}: ${r.baseline} -> ${r.current}`);
  if (regressions.length) {
    console.error(
      "Archetype ratchet failed: describe voters with census buckets (dim:bucket), not archetypes."
    );
    process.exit(1);
  }
  console.log("Archetype ratchet ok.");
}
