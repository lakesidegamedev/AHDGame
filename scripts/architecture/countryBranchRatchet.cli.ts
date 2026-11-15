import {
  findRegressions,
  lowerBaseline,
  readBaseline,
  scanRepo,
  writeBaseline,
} from "./countryBranchRatchet";

const mode = process.argv[2] ?? "check";
const current = scanRepo();

if (mode === "init") {
  writeBaseline(current);
  console.log(`Wrote baseline for ${Object.keys(current).length} files.`);
} else if (mode === "lower") {
  const baseline = readBaseline().files;
  const lowered = lowerBaseline(baseline, current);
  writeBaseline(lowered);
  console.log(
    `Baseline lowered: ${Object.keys(baseline).length} -> ${Object.keys(lowered).length} files.`
  );
} else {
  const regressions = findRegressions(readBaseline().files, current);
  for (const r of regressions) console.error(`${r.file}: ${r.baseline} -> ${r.current}`);
  if (regressions.length) {
    console.error(
      "Country branch ratchet failed: put the country rule in src/lib/countries/<cc>/ instead of branching on the code."
    );
    process.exit(1);
  }
  console.log("Country branch ratchet ok.");
}
