// Build public/at-regions.json from Austria's 9 Bundesländer (geoBoundaries
// AUT ADM1) — dissolve them into the game's 5 macro-regions (matching
// src/lib/seeds/at/atRegions.ts). Länder are dissolved through ONE shared
// topojson topology so adjacent macro-regions share border arcs and union
// cleanly into one Austria blob on the /world overlay (see build-gr-geo.mjs).
//
// Assignment notes: Burgenland folds into Lower Austria (the eastern/Soviet
// zone); Salzburg into Upper Austria (the Danube/US zone); Carinthia into
// Styria (the south/UK zone); Vorarlberg into Tyrol (the Alpine west/French
// zone). AT_TYR stays a MultiPolygon — East Tyrol is an exclave separated
// from North Tyrol by Salzburg land, so no island-dropping here (landlocked).
//
// Output winding is normalized to the repo convention: outer rings CLOCKWISE
// in (lon,lat), holes CCW — d3-geo interprets rings spherically and renders a
// CCW outer ring as "the globe minus the shape".
// Run: node scripts/maps/build-at-geo.mjs
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { topology } from "topojson-server";
import { merge as topoMerge } from "topojson-client";
import { simplifyArc, rewind, roundGeometry } from "./geometry.mjs";

const __d = path.dirname(fileURLToPath(import.meta.url));
const pub = (f) => path.resolve(__d, "../../public", f);

const GB = (iso, adm) => `https://www.geoboundaries.org/api/current/gbOpen/${iso}/${adm}/`;

// Ascii-fold lowercase so source spelling variants key the same.
const fold = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");

// geoBoundaries AUT ADM1 shapeNames (German), grouped into the five regions.
const REGIONS = {
  AT_VIE: { na: "Vienna", units: ["Wien"] },
  AT_NOE: { na: "Lower Austria & Burgenland", units: ["Niederösterreich", "Burgenland"] },
  AT_OOE: { na: "Upper Austria & Salzburg", units: ["Oberösterreich", "Salzburg"] },
  AT_STK: { na: "Styria & Carinthia", units: ["Steiermark", "Kärnten"] },
  AT_TYR: { na: "Tyrol & Vorarlberg", units: ["Tirol", "Vorarlberg"] },
};

const UNIT_TO_REGION = new Map();
for (const [regionId, { units }] of Object.entries(REGIONS))
  for (const u of units) UNIT_TO_REGION.set(fold(u), regionId);
if (UNIT_TO_REGION.size !== 9)
  throw new Error(`Bundesland table has ${UNIT_TO_REGION.size} entries, expected 9`);

// Arcs are simplified IN THE TOPOLOGY (Visvalingam, endpoints pinned) so
// shared borders stay consistent; threshold in deg² of triangle area; output
// coords round to 4 decimals.
const SIMPLIFY_MIN_TRIANGLE = 1.2e-5;
const ROUND = (v) => Math.round(v * 1e4) / 1e4;

async function fetchGB(iso, adm) {
  const meta = await (await fetch(GB(iso, adm))).json();
  if (!meta?.gjDownloadURL) throw new Error(`${iso}/${adm}: no gjDownloadURL`);
  const gj = await (await fetch(meta.gjDownloadURL)).json();
  if (!gj?.features?.length) throw new Error(`${iso}/${adm}: no features`);
  return gj;
}

const aut = await fetchGB("AUT", "ADM1");
if (aut.features.length !== 9)
  throw new Error(`AUT ADM1: expected 9 Bundesländer, got ${aut.features.length}`);

const objects = {};
const seen = new Set();
for (const f of aut.features) {
  const raw = f.properties?.shapeName;
  if (!raw) throw new Error(`AUT Bundesland with no shapeName`);
  const key = fold(raw);
  const regionId = UNIT_TO_REGION.get(key);
  if (!regionId) throw new Error(`unmapped Bundesland: "${raw}" (folded: ${key})`);
  if (seen.has(key)) throw new Error(`duplicate Bundesland: "${raw}"`);
  seen.add(key);
  (objects[regionId] ??= { type: "FeatureCollection", features: [] }).features.push(f);
}
if (seen.size !== 9) throw new Error(`consumed ${seen.size} Bundesländer, expected 9`);

// Unquantized topology: arcs keep absolute coordinates, so they can be
// simplified in place (a quantized topology delta-encodes arcs).
const topo = topology(objects);
topo.arcs = topo.arcs.map((arc) => simplifyArc(arc, SIMPLIFY_MIN_TRIANGLE));

const out = [];
for (const [regionId, { na }] of Object.entries(REGIONS)) {
  const obj = topo.objects[regionId];
  if (!obj) throw new Error(`no Bundesländer mapped to ${regionId}`);
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
writeFileSync(pub("at-regions.json"), json + "\n");
console.log(
  `wrote ${out.length} features (${(json.length / 1024).toFixed(0)}KB): ${out
    .map((f) => f.properties.regionCode)
    .join(", ")}`
);
