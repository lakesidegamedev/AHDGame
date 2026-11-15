/** Render the qualified Census CD120 source cache into preset-specific SVG geometry.
 * Run prepare-us-congressional-2027.py first, then:
 * npx tsx scripts/geo/build-us-congressional-2027.mjs --cache <external-directory>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { geoAlbersUsa, geoPath } from "d3-geo";

const req = createRequire(import.meta.url);
const { states2027 } = req("../../src/lib/countries/us/data/usStates2027.ts");
const arg = process.argv.indexOf("--cache");
if (arg < 0 || !process.argv[arg + 1]) throw new Error("Select an external source cache");
const cache = resolve(process.argv[arg + 1]);
if (!relative(process.cwd(), cache).startsWith("..")) throw new Error("Cache must be external");
const sources = JSON.parse(readFileSync(join(cache, "sources.json"), "utf8"));
const out = resolve("src/data/congressional-districts/2027");
const manifestPath = join(out, "manifest.json");
if (existsSync(manifestPath)) {
  const pinned = JSON.parse(readFileSync(manifestPath, "utf8")).sources;
  if (
    sources.length !== pinned.length ||
    sources.some((s) => !pinned.some((p) => p.state === s.state && p.sha256 === s.sha256))
  )
    throw new Error("Census sources differ from the reviewed manifest");
}
mkdirSync(out, { recursive: true });
const path = geoPath(geoAlbersUsa()).digits(2);
let count = 0;
const outputs = [];
for (const state of states2027.filter((s) => s.houseDistricts > 0)) {
  const source = sources.find((s) => s.state === state._id);
  if (!source || source.districts !== state.houseDistricts)
    throw new Error(`Bad source coverage ${state._id}`);
  const geo = JSON.parse(readFileSync(join(cache, `${state._id}.geojson`), "utf8"));
  const ids = geo.features.map((f) => f.properties.cd);
  const expected = Array.from(
    { length: state.houseDistricts },
    (_, i) => `${state._id}-${state.houseDistricts === 1 ? "AL" : String(i + 1).padStart(2, "0")}`
  );
  if (JSON.stringify(ids) !== JSON.stringify(expected))
    throw new Error(`Bad district identities ${state._id}`);
  const bounds = path.bounds(geo);
  if (!bounds.flat().every(Number.isFinite)) throw new Error(`Bad projected bounds ${state._id}`);
  const [x, y] = bounds[0];
  const width = bounds[1][0] - x,
    height = bounds[1][1] - y;
  const padding = Math.max(width, height) * 0.025;
  const viewBox = [x - padding, y - padding, width + padding * 2, height + padding * 2]
    .map((n) => Number(n.toFixed(3)))
    .join(" ");
  const districts = geo.features.map((feature) => {
    const svg = path(feature);
    if (!svg || /NaN|Infinity/.test(svg))
      throw new Error(`Empty district ${feature.properties.cd}`);
    return { cd: feature.properties.cd, path: svg, cookPVI: 0 };
  });
  // Census geometry contains no PVI. Zero is a compatibility rendering fallback,
  // explicitly marked unavailable rather than presented as an observed even lean.
  const data = {
    viewBox,
    districts,
    geometrySource: "census-tiger2026-cd120",
    congress: 120,
    leanBasis: "unavailable-neutral-rendering-fallback",
  };
  const text = JSON.stringify(data) + "\n";
  writeFileSync(join(out, `${state._id}.json`), text);
  outputs.push({
    state: state._id,
    districts: districts.length,
    sha256: createHash("sha256").update(text).digest("hex"),
  });
  count += districts.length;
}
if (count !== 435 || outputs.length !== 50)
  throw new Error("Incomplete US voting-district geometry");
writeFileSync(
  join(out, "manifest.json"),
  JSON.stringify(
    {
      congress: 120,
      capturedAt: "2026-11-11",
      source: "Census TIGER/Line 2026 CD120; corrected files downloaded after November 9",
      sourceNotes:
        "https://www.census.gov/programs-surveys/geography/technical-documentation/user-note/120cd.html",
      projection: "d3 geoAlbersUsa",
      renderingSimplificationDegrees: 0.00025,
      use: "Rendering geometry only; not a population or vote allocation crosswalk. PVI is unavailable.",
      sources,
      outputs,
    },
    null,
    2
  ) + "\n"
);
console.log(JSON.stringify({ states: outputs.length, districts: count, output: out }));
