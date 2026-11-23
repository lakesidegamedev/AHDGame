/**
 * Rewrites stored country brief and system news text: bond wording, austerity
 * amounts, name-swapped outlooks and upgrades filed as strain. Text only,
 * deletes nothing. Dry run unless --apply is passed.
 */
import type { Db } from "mongodb";
import { connectDb, closeDb } from "../utils/db";
import { COUNTRY_CURRENCY_MAP } from "../../src/lib/constants/currencies";
import { repairBriefStory } from "../../src/lib/country/background/rules/briefTextRepair";

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
  const pattern = /nearest bond pays|will consolidate its budget|credit rating moved|: growth /;
  const headlinePattern = / (outlook|debt under strain)$/;

  const briefs = db.collection<{
    _id: string;
    countryId: string;
    headline: string;
    body: string;
  }>("countryBriefs");
  for await (const doc of briefs.find({
    $or: [{ body: pattern }, { headline: headlinePattern }],
  })) {
    result.briefsScanned++;
    const next = repairBriefStory(
      { headline: doc.headline ?? "", body: doc.body },
      currencyOf(doc.countryId)
    );
    if (next.body === doc.body && next.headline === doc.headline) continue;
    result.briefsChanged++;
    if (result.samples.length < 5)
      result.samples.push({ id: String(doc._id), before: doc.body, after: next.body });
    if (!opts.dryRun)
      await briefs.updateOne(
        { _id: doc._id },
        { $set: { body: next.body, headline: next.headline } }
      );
  }

  const news = db.collection<{ _id: unknown; content: string; title?: string }>("newsPosts");
  for await (const doc of news.find({
    isSystem: true,
    $or: [{ content: pattern }, { title: headlinePattern }],
  })) {
    result.newsScanned++;
    const suffix = /\s\(\/country\/([a-z]{2,3})\)$/.exec(doc.content);
    if (!suffix) continue;
    const text = doc.content.slice(0, doc.content.length - suffix[0].length);
    const next = repairBriefStory(
      { headline: doc.title ?? "", body: text },
      currencyOf(suffix[1].toUpperCase())
    );
    if (next.body === text && next.headline === (doc.title ?? "")) continue;
    result.newsChanged++;
    if (!opts.dryRun)
      await news.updateOne(
        { _id: doc._id as never },
        {
          $set: {
            content: `${next.body}${suffix[0]}`,
            ...(doc.title !== undefined ? { title: next.headline } : {}),
          },
        }
      );
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
