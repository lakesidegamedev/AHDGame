import {
  findRegressions,
  lowerBaseline,
  readBaseline,
  scanRepo,
  writeBaseline,
} from "./commentRatchet";

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
  for (const r of regressions)
    console.error(`${r.file}: ${r.metric} ${r.baseline} -> ${r.current}`);
  if (regressions.length) {
    console.error(
      "Comment ratchet failed: explain why, not history; shorten or remove the comments above."
    );
    process.exit(1);
  }
  console.log("Comment ratchet ok.");
}
