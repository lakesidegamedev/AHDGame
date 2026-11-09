/**
 * Read-only preflight for the 2027 reset. Connects to the database named by the
 * environment, runs every check, prints a plain list, and exits non-zero on any
 * failure. It never writes and never prints the connection string.
 *
 *   PREFLIGHT_MONGODB_URI=... PREFLIGHT_MONGODB_DB=... \
 *     npx tsx scripts/reset/preflight-2027.ts [--mode=pre-reset|fresh] [--countries=US,UK]
 */
import { MongoClient } from "mongodb";
import {
  formatPreflightFinding,
  type PreflightMode,
} from "@/lib/admin/resetContract/rules/preflight2027";
import { runPreflight2027 } from "@/lib/admin/resetContract/preflight2027";

function argValue(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<number> {
  const uri = process.env.PREFLIGHT_MONGODB_URI;
  const dbName = process.env.PREFLIGHT_MONGODB_DB;
  if (!uri || !dbName) {
    console.error("Set PREFLIGHT_MONGODB_URI and PREFLIGHT_MONGODB_DB for the target database.");
    return 2;
  }
  const mode = (argValue("mode") ?? "pre-reset") as PreflightMode;
  if (mode !== "pre-reset" && mode !== "fresh") {
    console.error('--mode must be "pre-reset" or "fresh".');
    return 2;
  }
  const countries = argValue("countries")?.split(",").filter(Boolean);

  const client = new MongoClient(uri, { readPreference: "secondaryPreferred" });
  try {
    await client.connect();
    const report = await runPreflight2027(client.db(dbName), { mode, countries });
    console.log(
      `2027 preflight (${mode}) on database "${dbName}"; countries: ${report.countries.join(", ")}`
    );
    const failures = report.findings.filter((finding) => finding.severity === "fail");
    for (const finding of report.findings) console.log(formatPreflightFinding(finding));
    console.log(
      failures.length === 0
        ? `PASS (${report.findings.length} warning(s))`
        : `FAIL: ${failures.length} failure(s)`
    );
    return failures.length === 0 ? 0 : 1;
  } finally {
    await client.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`preflight crashed: ${error instanceof Error ? error.name : "unknown error"}`);
    process.exitCode = 2;
  });
