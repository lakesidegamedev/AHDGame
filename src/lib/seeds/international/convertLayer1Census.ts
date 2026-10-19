import type { CountryLayer1Model } from "./types";

type Layer1Census = Record<"ethnicity" | "age" | "education" | "income" | "urbanization", object>;

/** Create region wrappers while retaining the original dimension records. */
export function convertLayer1Census<T extends Layer1Census>(
  raw: Record<string, T>
): CountryLayer1Model["census"] {
  return Object.fromEntries(
    Object.entries(raw).map(([regionId, layer1]) => [
      regionId,
      {
        ethnicity: layer1.ethnicity as unknown as Record<string, number>,
        age: layer1.age as unknown as Record<string, number>,
        education: layer1.education as unknown as Record<string, number>,
        income: layer1.income as unknown as Record<string, number>,
        urbanization: layer1.urbanization as unknown as Record<string, number>,
      },
    ])
  );
}
