import { writeFileSync } from "node:fs";
import { deriveRegionalTexture1991 } from "@/lib/politicalMetrics/derive/opening1991";

const texture = deriveRegionalTexture1991();
if (process.argv.includes("--emit")) {
  writeFileSync(
    "src/data/political-metrics/regional-texture-1991.json",
    JSON.stringify(texture, null, 1) + "\n"
  );
}
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(texture).map(([cc, regions]) => [
        cc,
        {
          regions: Object.keys(regions).length,
          texturedCells: Object.values(regions).reduce(
            (sum, values) => sum + Object.keys(values).length,
            0
          ),
        },
      ])
    )
  )
);
