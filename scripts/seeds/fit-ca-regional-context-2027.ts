/**
 * Fit Canada's 2027 per-province electorate offsets so each province's census
 * electorate lean equals its 2025 federal-vote target (caFederalVote2025.ts).
 * A region's lean moves one-for-one with its offset, so a few fixed-point
 * passes absorb any lean clamping.
 *
 * Usage: npx tsx scripts/seeds/fit-ca-regional-context-2027.ts > src/lib/countries/ca/data/caRegionalContext2027.ts
 */
import {
  caOpeningLeanTarget2027,
  CA_FEDERAL_VOTE_2025,
} from "@/lib/countries/ca/data/caFederalVote2025";
import { caRegionalContext2027 } from "@/lib/countries/ca/data/caRegionalContext2027";
import { censusStateLean } from "@/lib/demographics/censusLean";
import { clearGranularElectorateCache } from "@/lib/demographics/granularElectorate";

const ctx = caRegionalContext2027 as Record<string, { economicLean: number; socialLean: number }>;
const round = (v: number) => Math.round(v * 100) / 100;
const leanOf = (id: string) => {
  clearGranularElectorateCache();
  return censusStateLean({ _id: id, countryId: "CA" } as never, {
    countryId: "CA",
    stateId: id,
    preset: "2027-default",
    year: 2027,
    startingYear: 2027,
  });
};
const report: string[] = [];
for (const id of Object.keys(CA_FEDERAL_VOTE_2025).sort()) {
  const target = caOpeningLeanTarget2027(id)!;
  ctx[id] = ctx[id] ?? { economicLean: 0, socialLean: 0 };
  for (let i = 0; i < 6; i++) {
    const l = leanOf(id);
    ctx[id] = {
      economicLean: round(ctx[id].economicLean + target.economicLean - l.economicLean),
      socialLean: round(ctx[id].socialLean + target.socialLean - l.socialLean),
    };
  }
  const l = leanOf(id);
  report.push(
    `${id} target ${target.economicLean.toFixed(2)}/${target.socialLean.toFixed(2)} lean ${l.economicLean.toFixed(2)}/${l.socialLean.toFixed(2)} offset ${ctx[id].economicLean}/${ctx[id].socialLean}`
  );
}
console.error(report.join("\n"));
console.log(`/**
 * Canada 2027 per-province lean offsets, fitted so each province's census
 * electorate reproduces its 2025 federal vote (caFederalVote2025.ts). Generated
 * by scripts/seeds/fit-ca-regional-context-2027.ts; regenerate rather than edit.
 */
export const caRegionalContext2027: Record<string, { economicLean: number; socialLean: number }> = ${JSON.stringify(ctx, null, 2)};
`);
