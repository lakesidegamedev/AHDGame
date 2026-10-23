// Build public/blr-regions.json — the Byelorussian SSR's six oblasts, matching
// src/lib/seeds/blr/blrRegions1953.ts.
//
// Single source: geoBoundaries gbOpen BLR ADM1 (six oblasts plus Minsk City,
// which is folded into Minsk oblast — the city is an enclave inside it, and a
// separate one-city region would carry a third of the republic's politics on a
// dot). Shared oblast borders come from one file, so the dissolve produces
// clean internal boundaries.
//
// Output winding is normalized to the repo convention: outer rings CLOCKWISE
// in (lon,lat), holes CCW — d3-geo interprets rings spherically and renders a
// CCW outer ring as "the globe minus the shape".
// Run: node scripts/maps/build-blr-geo.mjs
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { topology } from "topojson-server";
import { merge as topoMerge } from "topojson-client";
import { simplifyArc, rewind, roundGeometry } from "./geometry.mjs";

const __d = path.dirname(fileURLToPath(import.meta.url));
const pub = (f) => path.resolve(__d, "../../public", f);

const GB = (iso, adm) => `https://www.geoboundaries.org/api/current/gbOpen/${iso}/${adm}/`;

const REGION_PROVINCES = {
  BLR_MIN: ["Minsk", "Minsk City"],
  BLR_BRE: ["Brest"],
  BLR_HOM: ["Gomel"],
  BLR_GRO: ["Grodno"],
  BLR_MOG: ["Mogilev"],
  BLR_VIT: ["Vitebsk"],
};

const REGION_NAMES = {
  BLR_MIN: "Minsk",
  BLR_BRE: "Brest",
  BLR_HOM: "Gomel",
  BLR_GRO: "Grodno",
  BLR_MOG: "Mogilev",
  BLR_VIT: "Vitebsk",
};

const SIMPLIFY_MIN_TRIANGLE = 1.2e-5;
const ROUND = (v) => Math.round(v * 1e4) / 1e4;

async function fetchGB(iso, adm) {
  const meta = await (await fetch(GB(iso, adm))).json();
  if (!meta?.gjDownloadURL) throw new Error(`${iso}/${adm}: no gjDownloadURL`);
  const gj = await (await fetch(meta.gjDownloadURL)).json();
  if (!gj?.features?.length) throw new Error(`${iso}/${adm}: no features`);
  return gj;
}

const provinceToRegion = new Map();
for (const [regionId, names] of Object.entries(REGION_PROVINCES))
  for (const n of names) provinceToRegion.set(n, regionId);

const objects = {};
const push = (regionId, feature) =>
  (objects[regionId] ??= { type: "FeatureCollection", features: [] }).features.push(feature);

const blr = await fetchGB("BLR", "ADM1");
if (blr.features.length !== 7)
  throw new Error(`BLR ADM1: expected 7 units, got ${blr.features.length}`);
const counts = {};
for (const f of blr.features) {
  const name = f.properties?.shapeName;
  const regionId = provinceToRegion.get(name);
  if (!regionId) throw new Error(`unmapped BLR unit: ${JSON.stringify(name)}`);
  push(regionId, f);
  counts[regionId] = (counts[regionId] ?? 0) + 1;
}
for (const [regionId, names] of Object.entries(REGION_PROVINCES))
  if (counts[regionId] !== names.length)
    throw new Error(`${regionId} matched ${counts[regionId]} units, expected ${names.length}`);
console.log(
  `BLR ADM1 → ${Object.entries(counts)
    .map(([r, c]) => `${r} (${c})`)
    .join(", ")}`
);

const topo = topology(objects);
topo.arcs = topo.arcs.map((arc) => simplifyArc(arc, SIMPLIFY_MIN_TRIANGLE));

const out = [];
for (const [regionId, na] of Object.entries(REGION_NAMES)) {
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
writeFileSync(pub("blr-regions.json"), json + "\n");
console.log(
  `wrote ${out.length} features (${(json.length / 1024).toFixed(0)}KB): ${out
    .map((f) => f.properties.regionCode)
    .join(", ")}`
);
