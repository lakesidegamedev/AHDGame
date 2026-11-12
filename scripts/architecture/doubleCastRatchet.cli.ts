import {
  findRegressions,
  lowerBaseline,
  readBaseline,
  scanRepo,
  total,
  writeBaseline,
} from "./doubleCastRatchet";

const mode = process.argv[2] ?? "check";
const current = scanRepo();

if (mode === "init") {
  writeBaseline(current);
  console.log(`Wrote baseline for ${Object.keys(current).length} files.`);
} else if (mode === "lower") {
  const baseline = readBaseline().files;
  const lowered = lowerBaseline(baseline, current);
  writeBaseline(lowered);
  console.log(`double casts: ${total(baseline)} -> ${total(lowered)}`);
} else if (mode === "totals") {
  console.log(total(current));
} else {
  const regressions = findRegressions(readBaseline().files, current);
  for (const r of regressions) console.error(`${r.file}: ${r.baseline} -> ${r.current}`);
  if (regressions.length) {
    console.error(
      "Double cast ratchet failed: replace `as unknown as` with a typed getter, a generic find<T>, or a type guard."
    );
    process.exit(1);
  }
  console.log("Double cast ratchet ok.");
}
