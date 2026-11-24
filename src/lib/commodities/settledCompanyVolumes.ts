/**
 * Each company's settled market volume for one good: what it offered (its
 * part of supply) and what it ordered (its part of demand), worldwide and per
 * country. Pure: settled company book rows in, per-company totals out.
 */
import type { ProducerMarketCompanyBookRow } from "@/lib/db/repositories/producerMarketCompanyBooks";

export function settledCompanyVolumes(rows: readonly ProducerMarketCompanyBookRow[]) {
  const offered = new Map<string, number>();
  const requested = new Map<string, number>();
  const offeredByCountry = new Map<string, Map<string, number>>();
  const requestedByCountry = new Map<string, Map<string, number>>();
  const add = (target: Map<string, number>, key: string, units: number) => {
    if (units > 0) target.set(key, (target.get(key) ?? 0) + units);
  };
  const country = (target: Map<string, Map<string, number>>, countryId: string) => {
    let m = target.get(countryId);
    if (!m) target.set(countryId, (m = new Map()));
    return m;
  };
  for (const r of rows) {
    add(offered, r.accountId, r.offered);
    add(requested, r.accountId, r.requested);
    add(country(offeredByCountry, r.countryId), r.accountId, r.offered);
    add(country(requestedByCountry, r.countryId), r.accountId, r.requested);
  }
  for (const m of [offeredByCountry, requestedByCountry])
    for (const [k, v] of m) if (v.size === 0) m.delete(k);
  return { offered, requested, offeredByCountry, requestedByCountry };
}
