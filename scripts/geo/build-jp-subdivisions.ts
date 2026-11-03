/** Build prefecture map shards offline from the committed Japan topology and directory. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import { JP_PREFECTURES, JP_REGION_IDS } from "../../src/lib/countries/jp/data/jpRegionDirectory";
import { format, resolveConfig } from "prettier";

async function main() {
  const topology = JSON.parse(await readFile("public/japan-prefectures.json", "utf8")) as Topology;
  const collection = feature(
    topology,
    topology.objects.japan as GeometryCollection
  ) as FeatureCollection<Geometry, { id: number }>;
  if (
    collection.features.length !== 47 ||
    new Set(collection.features.map((f) => f.properties.id)).size !== 47
  )
    throw new Error("Incomplete prefecture geometry");
  const output = "src/data/subdivisions/jp";
  await mkdir(output, { recursive: true });
  for (const regionId of JP_REGION_IDS) {
    const prefectures = JP_PREFECTURES.filter((p) => p.regionId === regionId);
    const geometries = prefectures.map((p) => {
      const geometry = collection.features.find((f) => f.properties.id === p.id);
      if (!geometry) throw new Error(`Missing prefecture ${p.id}`);
      return geometry;
    });
    const projection = geoMercator().fitExtent(
      [
        [10, 10],
        [790, 590],
      ],
      { type: "FeatureCollection", features: geometries }
    );
    const path = geoPath(projection).digits(2);
    const data = {
      viewBox: "0 0 800 600",
      subdivisions: prefectures.map((p, i) => {
        const geometryPath = path(geometries[i]);
        if (!geometryPath) throw new Error(`Empty prefecture ${p.id}`);
        return {
          id: `JP-${String(p.id).padStart(2, "0")}`,
          name: p.name,
          path: geometryPath,
          electorate: p.population,
          leanScalar: 0,
        };
      }),
    };
    const target = join(output, `${regionId}.json`);
    await writeFile(
      target,
      await format(JSON.stringify(data), { ...(await resolveConfig(target)), filepath: target })
    );
  }
  console.log("Built 47 prefectures across 8 Japan regions");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
