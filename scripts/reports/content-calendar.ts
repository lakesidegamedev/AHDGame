/**
 * Year-by-year content calendar for the 2027 world, 2027 to 2055.
 *
 * Run: npx tsx scripts/reports/content-calendar.ts [--json] [--from 2027] [--to 2055]
 *
 * Lists, per year and per full-simulation country, the eligible living-conflict
 * families, crisis templates, player events, opportunities, law types and
 * researchable tech tiers. Deterministic: it reads static catalogues only, no
 * database. The pass/fail version is `src/lib/world/contentCalendar.test.ts`;
 * this script exists for the reviewable table. Exits 1 when any year has an
 * empty category for any country.
 */

import {
  buildContentCalendar,
  calendarGaps,
  renderContentCalendarMarkdown,
} from "../../src/lib/world/contentCalendar";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const from = flag("--from");
  const to = flag("--to");
  const calendar = buildContentCalendar({
    ...(from ? { firstYear: Number(from) } : {}),
    ...(to ? { lastYear: Number(to) } : {}),
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(calendar, null, 2));
  } else {
    process.stdout.write(renderContentCalendarMarkdown(calendar));
  }
  if (calendarGaps(calendar).length > 0) process.exitCode = 1;
}

main();
