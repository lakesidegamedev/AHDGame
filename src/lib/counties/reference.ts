/**
 * County reference geography supplies dated population weights for initialization.
 * loadCountyReference reads the committed map files; runtime populations belong
 * to the counties collection and are never replaced by these modern headcounts.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export interface CountyReference {
  fips: string;
  name: string;
  population: number;
}
const cache = new Map<string, Promise<CountyReference[]>>();
export function loadCountyReference(stateId: string): Promise<CountyReference[]> {
  if (!/^[A-Z]{2}$/.test(stateId)) throw new Error("Invalid county state ID");
  let pending = cache.get(stateId);
  if (!pending) {
    pending = readFile(join(process.cwd(), "src/data/counties", `${stateId}.json`), "utf8")
      .then((raw) => {
        const parsed = JSON.parse(raw) as { counties: CountyReference[] };
        if (!parsed.counties?.length) throw new Error(`Missing county reference for ${stateId}`);
        return parsed.counties.map(({ fips, name, population }) => ({ fips, name, population }));
      })
      .catch((error) => {
        cache.delete(stateId);
        throw error;
      });
    cache.set(stateId, pending);
  }
  return pending;
}
