import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PopulationSubdivisionReference } from "@/lib/counties/subdivisionReference";
import { hasCanadianLocalGeography } from "./rules/localGeography";

const cache = new Map<string, Promise<PopulationSubdivisionReference[]>>();

/** 2021 resident weights, proportionally scaled to the game's province total. */
export function loadCaPopulationSubdivisions(
  stateId: string
): Promise<PopulationSubdivisionReference[]> {
  if (!hasCanadianLocalGeography(stateId)) throw new Error("Invalid Canadian province ID");
  let pending = cache.get(stateId);
  if (!pending) {
    pending = readFile(
      join(process.cwd(), "src/data/subdivisions/ca/census-divisions", `${stateId}.json`),
      "utf8"
    )
      .then((raw) => {
        const data = JSON.parse(raw) as {
          subdivisions: { id: string; name: string; population: number }[];
        };
        if (!data.subdivisions?.length) throw new Error(`Missing census divisions for ${stateId}`);
        return data.subdivisions.map(({ id, name, population }) => ({ id, name, population }));
      })
      .catch((error) => {
        cache.delete(stateId);
        throw error;
      });
    cache.set(stateId, pending);
  }
  return pending;
}
