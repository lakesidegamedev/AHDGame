/**
 * Rewrites stored country brief and system news text: the bond sentence and
 * austerity amounts printed as huge percentages. Changes text only, deletes
 * nothing. Dry run unless --apply is passed.
 */
import type { Db } from "mongodb";
import { connectDb, closeDb } from "../utils/db";
import { COUNTRY_CURRENCY_MAP } from "../../src/lib/constants/currencies";
import { repairBriefBody } from "../../src/lib/country/background/rules/briefTextRepair";

export interface RepairResult {
  briefsScanned: number;
  briefsChanged: number;
  newsScanned: number;
  newsChanged: number;
  samples: { id: string; before: string; after: string }[];
}

const currencyOf = (countryId: string): string | null =>
  (COUNTRY_CURRENCY_MAP as Record<string, string>)[countryId] ?? null;

export async function repairCountryBriefText(
  db: Db,
  opts: { dryRun: boolean }
): Promise<RepairResult> {
  const result: RepairResult = {
    briefsScanned: 0,
    briefsChanged: 0,
    newsScanned: 0,
    newsChanged: 0,
    samples: [],
  };
  const pattern = /nearest bond pays|will consolidate its budget/;

  const briefs = db.collection<{ _id: string; countryId: string; body: string }>("countryBriefs");
  for await (const doc of briefs.find({ body: pattern })) {
    result.briefsScanned++;
    const next = repairBriefBody(doc.body, currencyOf(doc.countryId));
    if (next === doc.body) continue;
    result.briefsChanged++;
    if (result.samples.length < 5)
      result.samples.push({ id: String(doc._id), before: doc.body, after: next });
    if (!opts.dryRun) await briefs.updateOne({ _id: doc._id }, { $set: { body: next } });
  }

  const news = db.collection<{ _id: unknown; content: string }>("newsPosts");
  for await (const doc of news.find({ isSystem: true, content: pattern })) {
    result.newsScanned++;
    const suffix = /\s\(\/country\/([a-z]{2,3})\)$/.exec(doc.content);
    if (!suffix) continue;
    const text = doc.content.slice(0, doc.content.length - suffix[0].length);
    const next = repairBriefBody(text, currencyOf(suffix[1].toUpperCase()));
    if (next === text) continue;
    result.newsChanged++;
    if (!opts.dryRun)
      await news.updateOne({ _id: doc._id as never }, { $set: { content: `${next}${suffix[0]}` } });
  }
  return result;
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply) console.log("[dry-run] No writes will be made. Pass --apply to write.");
  const db = await connectDb();
  try {
    const result = await repairCountryBriefText(db, { dryRun: !apply });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeDb();
  }
}

if (process.argv[1]?.includes("repair-country-brief-text")) {
  void main();
}
