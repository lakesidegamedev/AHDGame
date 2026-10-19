// Build public/ua-regions.json — the Ukrainian SSR's six macro-regions,
// matching src/lib/seeds/ua/uaRegions1953.ts.
//
// Single source: geoBoundaries gbOpen UKR ADM1 (27 oblasts + Kyiv and
// Sevastopol as city units), grouped along the divisions that actually drive
// 1953 politics and economy: the Kyiv/Right Bank core, the recently-annexed
// west, Podolia, the Donbas coalfield, the Dnieper industrial belt, and the
// Black Sea coast. Shared oblast borders come from one file, so the dissolve
// produces clean internal boundaries.
//
// Crimea: transferred from the RSFSR to the Ukrainian SSR in 1954, so in a
// strict 1953 world it is Russian. It is grouped into the southern region here
// because one geometry file serves both Cold War presets and the 1979 world
// needs it Ukrainian; the seed carries the note.
//
// Output winding is normalized to the repo convention: outer rings CLOCKWISE
// in (lon,lat), holes CCW — d3-geo interprets rings spherically and renders a
// CCW outer ring as "the globe minus the shape".
// Run: node scripts/maps/build-ua-geo.mjs
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
  UKR_KYI: ["Kyiv", "Kyiv Oblast", "Zhytomyr Oblast", "Chernihiv Oblast", "Cherkasy Oblast"],
  UKR_WES: [
    "Lviv Oblast",
    "Volyn Oblast",
    "Rivne Oblast",
    "Ternopil Oblast",
    "Ivano-Frankivsk Oblast",
    "Zakarpattia Oblast",
    "Chernivtsi Oblast",
  ],
  UKR_POD: ["Vinnytsia Oblast", "Khmelnytskyi Oblast"],
  UKR_DON: ["Donetsk Oblast", "Luhansk Oblast"],
  UKR_DNI: [
    "Dnipropetrovsk Oblast",
    "Zaporizhia Oblast",
    "Kharkiv Oblast",
    "Poltava Oblast",
    "Sumy Oblast",
    "Kirovohrad Oblast",
  ],
  UKR_SOU: [
    "Odessa Oblast",
    "Mykolaiv Oblast",
    "Kherson Oblast",
    "Autonomous Republic of Crimea",
    "Sevastopol",
  ],
};

const REGION_NAMES = {
  UKR_KYI: "Kyiv and the Right Bank",
  UKR_WES: "Western Ukraine",
  UKR_POD: "Podolia",
  UKR_DON: "Donbas",
  UKR_DNI: "Dnieper Industrial Belt",
  UKR_SOU: "Black Sea Coast",
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

const ukr = await fetchGB("UKR", "ADM1");
if (ukr.features.length !== 27)
  throw new Error(`UKR ADM1: expected 27 units, got ${ukr.features.length}`);
const counts = {};
for (const f of ukr.features) {
  const name = f.properties?.shapeName;
  const regionId = provinceToRegion.get(name);
  if (!regionId) throw new Error(`unmapped UKR unit: ${JSON.stringify(name)}`);
  push(regionId, f);
  counts[regionId] = (counts[regionId] ?? 0) + 1;
}
for (const [regionId, names] of Object.entries(REGION_PROVINCES))
  if (counts[regionId] !== names.length)
    throw new Error(`${regionId} matched ${counts[regionId]} units, expected ${names.length}`);
console.log(
  `UKR ADM1 → ${Object.entries(counts)
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
writeFileSync(pub("ua-regions.json"), json + "\n");
console.log(
  `wrote ${out.length} features (${(json.length / 1024).toFixed(0)}KB): ${out
    .map((f) => f.properties.regionCode)
    .join(", ")}`
);
