import { existsSync, readFileSync } from "node:fs";
import { ESLint, RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require("../eslint-rules/numbers-colour-contract.js");

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const file = "src/components/Example.tsx";

ruleTester.run("numbers-colour-contract", rule, {
  valid: [
    { filename: file, code: 'const a = <span className="text-success tabular-nums">x</span>;' },
    { filename: file, code: 'const a = <div className="bg-error/10 border-error" />;' },
    { filename: file, code: "const a = <b>{formatMoney(n)}</b>;" },
    { filename: file, code: "const a = <b onClick={() => save(n.toFixed(2))}>x</b>;" },
    { filename: file, code: "const a = <i style={{ width: `${p.toFixed(1)}%` }} />;" },
    { filename: file, code: "const v = n.toFixed(2);" },
    { filename: file, code: 'const c = "prefers-red-500";' },
    // Files outside .tsx and test files are out of scope.
    { filename: "src/lib/x.ts", code: 'const c = "text-red-500";' },
    { filename: "src/components/Example.test.tsx", code: "const a = <b>{n.toFixed(2)}</b>;" },
  ],
  invalid: [
    {
      filename: file,
      code: 'const a = <span className="text-red-500">x</span>;',
      errors: [{ messageId: "rawColour" }],
    },
    {
      filename: file,
      code: "const a = <span className={`flex bg-green-900/20 ${x}`}>x</span>;",
      errors: [{ messageId: "rawColour" }],
    },
    {
      filename: file,
      code: 'const k = "hover:text-red-400";',
      errors: [{ messageId: "rawColour" }],
    },
    {
      filename: file,
      code: "const a = <b>{n.toFixed(2)}</b>;",
      errors: [{ messageId: "inlineFormat" }],
    },
    {
      filename: file,
      code: "const a = <b>{`${n.toLocaleString()} votes`}</b>;",
      errors: [{ messageId: "inlineFormat" }],
    },
    {
      filename: file,
      code: "const a = <ul>{xs.map((x) => <li>{x.toFixed(1)}</li>)}</ul>;",
      errors: [{ messageId: "inlineFormat" }],
    },
    {
      filename: file,
      code: "const a = <b title={n.toLocaleString()}>x</b>;",
      errors: [{ messageId: "inlineFormat" }],
    },
  ],
});

describe("numbers-colour baseline", () => {
  const baseline: string[] = JSON.parse(
    readFileSync("eslint-rules/numbers-colour-baseline.json", "utf8")
  );
  it("is sorted, unique and lists only existing .tsx files", () => {
    expect([...baseline].sort()).toEqual(baseline);
    expect(new Set(baseline).size).toBe(baseline.length);
    for (const f of baseline) expect(existsSync(f), f).toBe(true);
  });

  it("switches the rule off for baseline files inside bracketed route folders", async () => {
    const bracketed = baseline.find((f) => f.includes("["));
    expect(bracketed).toBeDefined();
    const config = await new ESLint().calculateConfigForFile(bracketed!);
    const setting = config.rules?.["local/numbers-colour-contract"];
    expect(Array.isArray(setting) ? setting[0] : setting).toBe(0);
  }, 120_000);
});
