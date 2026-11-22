// Rewrites (or with --check, verifies) eslint-rules/numbers-colour-baseline.json:
// the .tsx files that still break the numbers-and-colour contract.
// Usage: node scripts/lint/numbers-colour-baseline.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "../../eslint-rules/numbers-colour-contract.js";

const path = "eslint-rules/numbers-colour-baseline.json";
const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.tsx"],
      languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { local: { rules: { c: rule } } },
      rules: { "local/c": "error" },
    },
  ],
});
const results = await eslint.lintFiles(["src/**/*.tsx"]);
const offenders = results
  .filter((r) => r.messages.some((m) => m.ruleId === "local/c"))
  .map((r) => r.filePath.slice(process.cwd().length + 1))
  .sort();
if (process.argv.includes("--check")) {
  const current = new Set(JSON.parse(readFileSync(path, "utf8")));
  const fixed = [...current].filter((f) => !offenders.includes(f));
  const added = offenders.filter((f) => !current.has(f));
  if (fixed.length || added.length) {
    console.error("Baseline out of date. Fixed (remove):", fixed, "New offenders:", added);
    process.exit(1);
  }
} else {
  writeFileSync(path, `${JSON.stringify(offenders, null, 2)}\n`);
  console.log(`${offenders.length} offenders written`);
}
