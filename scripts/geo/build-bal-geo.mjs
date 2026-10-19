// Build public/bal-regions.json — the three Baltic republics, matching
// src/lib/seeds/bal/balRegions1953.ts.
//
// Single source: geoBoundaries gbOpen ADM0 for EST, LVA and LTU. The republics
// ARE the regions here, so there is nothing to dissolve: a Baltic player runs
// Estonia, Latvia and Lithuania as three units, which is also how the Supreme
// Soviet seat map splits them.
//
// Output winding is normalized to the repo convention: outer rings CLOCKWISE
// in (lon,lat), holes CCW — d3-geo interprets rings spherically and renders a
// CCW outer ring as "the globe minus the shape".
// Run: node scripts/maps/build-bal-geo.mjs
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { topology } from "topojson-server";
import { merge as topoMerge } from "topojson-client";
import { simplifyArc, rewind, roundGeometry } from "./geometry.mjs";

const __d = path.dirname(fileURLToPath(import.meta.url));
const pub = (f) => path.resolve(__d, "../../public", f);

const GB = (iso, adm) => `https://www.geoboundaries.org/api/current/gbOpen/${iso}/${adm}/`;

const REGION_SOURCES = {
  BAL_EST: { iso: "EST", na: "Estonia" },
  BAL_LVA: { iso: "LVA", na: "Latvia" },
  BAL_LTU: { iso: "LTU", na: "Lithuania" },
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

const objects = {};
for (const [regionId, { iso }] of Object.entries(REGION_SOURCES)) {
  const gj = await fetchGB(iso, "ADM0");
  objects[regionId] = { type: "FeatureCollection", features: gj.features };
  console.log(`${iso} ADM0 → ${regionId} (${gj.features.length})`);
}

const topo = topology(objects);
topo.arcs = topo.arcs.map((arc) => simplifyArc(arc, SIMPLIFY_MIN_TRIANGLE));

const out = [];
for (const [regionId, { na }] of Object.entries(REGION_SOURCES)) {
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
writeFileSync(pub("bal-regions.json"), json + "\n");
console.log(
  `wrote ${out.length} features (${(json.length / 1024).toFixed(0)}KB): ${out
    .map((f) => f.properties.regionCode)
    .join(", ")}`
);
