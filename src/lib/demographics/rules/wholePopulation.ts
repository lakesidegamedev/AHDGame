/** Whole-person cohort allocation preserves the regional population exactly. */
import type { AgeSexVector } from "../cohortVector";
import { largestRemainderAllocate } from "@/lib/redistricting/budget";

export function wholePopulation(vector: AgeSexVector, population: number): AgeSexVector {
  if (!Number.isSafeInteger(population) || population < 0)
    throw new Error("Population must be a nonnegative whole-person stock");
  const cells = [...vector.male, ...vector.female];
  if (cells.some((cell) => !Number.isFinite(cell) || cell < 0))
    throw new Error("Invalid cohort weights");
  const allocated = largestRemainderAllocate(population, cells);
  return {
    male: allocated.slice(0, vector.male.length),
    female: allocated.slice(vector.male.length),
  };
}
