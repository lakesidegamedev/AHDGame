// Build public/hu-regions.json — Hungary's six regions (Budapest, Pest,
// Western & Southern Transdanubia, Northern Hungary, Great Plain), matching
// src/lib/seeds/hu/huRegions.ts.
//
// Source: Natural Earth 10m admin-1 (public domain), filtered to HUN — the
// only open dataset that ships Budapest as its own unit (geoBoundaries ADM1
// folds the capital into Pest). NE models Hungary as 43 units: 19 counties +
// Budapest + 23 city-counties; each city-county maps to its host county's
// region, so the dissolve tiles the country exactly. Names are matched
// ascii-folded (NE writes ô for ő: Gyôr, Hódmezôvásárhely).
//
// Output winding is normalized to the repo convention: outer rings CLOCKWISE
// in (lon,lat), holes CCW — d3-geo interprets rings spherically and renders a
// CCW outer ring as "the globe minus the shape".
// Run: node scripts/maps/build-hu-geo.mjs
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { topology } from "topojson-server";
import { merge as topoMerge } from "topojson-client";
import { simplifyArc, rewind, roundGeometry } from "./geometry.mjs";

const __d = path.dirname(fileURLToPath(import.meta.url));
const pub = (f) => path.resolve(__d, "../../public", f);

const NE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";

// Ascii-fold lowercase so NE spelling variants key the same.
const fold = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");

// Region ← counties + the city-counties inside them (folded names).
const REGION_UNITS = {
  HU_BUD: { na: "Budapest", units: ["Budapest"] },
  HU_PES: { na: "Pest", units: ["Pest", "Érd"] },
  HU_TRW: {
    na: "Western Transdanubia",
    units: [
      "Győr-Moson-Sopron",
      "Sopron",
      "Győr",
      "Vas",
      "Szombathely",
      "Zala",
      "Zalaegerszeg",
      "Nagykanizsa",
      "Komárom-Esztergom",
      "Tatabánya",
      "Veszprém",
      "Fejér",
      "Székesfehérvár",
      "Dunaújváros",
    ],
  },
  HU_TRS: {
    na: "Southern Transdanubia",
    units: ["Baranya", "Pécs", "Somogy", "Kaposvár", "Tolna", "Szekszárd"],
  },
  HU_NOR: {
    na: "Northern Hungary",
    units: ["Borsod-Abaúj-Zemplén", "Miskolc", "Heves", "Eger", "Nógrád", "Salgótarján"],
  },
  HU_ALF: {
    na: "Great Plain",
    units: [
      "Bács-Kiskun",
      "Kecskemét",
      "Békés",
      "Békéscsaba",
      "Csongrád",
      "Szeged",
      "Hódmezővásárhely",
      "Hajdú-Bihar",
      "Debrecen",
      "Jász-Nagykun-Szolnok",
      "Szolnok",
      "Szabolcs-Szatmár-Bereg",
      "Nyíregyháza",
    ],
  },
};

const UNIT_TO_REGION = new Map();
for (const [regionId, { units }] of Object.entries(REGION_UNITS))
  for (const u of units) UNIT_TO_REGION.set(fold(u), regionId);
// 42 distinct folded names cover the 43 NE features ("Veszprém" is both a
// county and a city-county; both belong to HU_TRW).
if (UNIT_TO_REGION.size !== 42)
  throw new Error(`unit table has ${UNIT_TO_REGION.size} entries, expected 42`);

// Same simplification/rounding pipeline as build-yu-geo.mjs: arcs simplified
// IN THE TOPOLOGY (Visvalingam, endpoints pinned) so shared county borders
// stay consistent; threshold in deg² of triangle area; coords round to 4
// decimals.
const SIMPLIFY_MIN_TRIANGLE = 1.2e-5;
const ROUND = (v) => Math.round(v * 1e4) / 1e4;

const ne = await (await fetch(NE_URL)).json();
const hun = ne.features.filter((f) => (f.properties || {}).adm0_a3 === "HUN");
if (hun.features?.length === 0 || hun.length !== 43)
  throw new Error(`NE 10m admin-1: expected 43 HUN units, got ${hun.length}`);

const objects = {};
const counts = {};
for (const f of hun) {
  const name = f.properties?.name;
  const regionId = UNIT_TO_REGION.get(fold(name ?? ""));
  if (!regionId) throw new Error(`unmapped HUN unit: ${JSON.stringify(name)}`);
  (objects[regionId] ??= { type: "FeatureCollection", features: [] }).features.push(f);
  counts[regionId] = (counts[regionId] ?? 0) + 1;
}
console.log(
  `NE HUN → ${Object.entries(counts)
    .map(([r, c]) => `${r} (${c})`)
    .join(", ")}`
);

// Unquantized topology: arcs keep absolute coordinates, so they can be
// simplified in place (a quantized topology delta-encodes arcs).
const topo = topology(objects);
topo.arcs = topo.arcs.map((arc) => simplifyArc(arc, SIMPLIFY_MIN_TRIANGLE));

const out = [];
for (const [regionId, { na }] of Object.entries(REGION_UNITS)) {
  const obj = topo.objects[regionId];
  if (!obj) throw new Error(`no source features mapped to ${regionId}`);
  const geometry = rewind(roundGeometry(topoMerge(topo, [obj]), ROUND));
  out.push({
    type: "Feature",
    id: regionId,
    properties: { id: regionId, na, regionCode: regionId },
    geometry,
  });
}
out.sort((a, b) => a.properties.regionCode.localeCompare(b.properties.regionCode));

const json = JSON.stringify({ type: "FeatureCollection", features: out });
writeFileSync(pub("hu-regions.json"), json + "\n");
console.log(
  `wrote ${out.length} features (${(json.length / 1024).toFixed(0)}KB): ${out
    .map((f) => f.properties.regionCode)
    .join(", ")}`
);
