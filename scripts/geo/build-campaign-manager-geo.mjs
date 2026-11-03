// Builds the Campaign Manager's national maps for the UK and Japan:
//   public/geo/campaign-manager/uk.json, public/geo/campaign-manager/jp.json
//
// Shape: { w, h, regions: { CODE: { n, d, bb, nb } }, units: { CODE: [{ id, n, d }] }, frame? }
// Regions and their sub-units (UK constituencies, JP prefectures) are projected
// into ONE 975x610 frame, so the map can zoom into a region and still draw its
// neighbours' sub-units around it. Sub-unit ids match src/data/subdivisions,
// which is how live shares from the subdivision-results route find their shape.
//
// Run: node scripts/geo/build-campaign-manager-geo.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { geoArea, geoBounds, geoConicConformal, geoMercator, geoPath } from "d3-geo";

const require = createRequire(import.meta.url);
const topo = require("topojson-client");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "public/geo/campaign-manager");
const W = 975;
const H = 610;
const PAD = 12;

// d3 wants the opposite winding of RFC 7946; a ring area over 2pi means it is inverted.
function rewind(f) {
  if (geoArea(f) > 2 * Math.PI) {
    const g = f.geometry;
    const rev = (poly) => poly.map((r) => r.slice().reverse());
    if (g.type === "Polygon") g.coordinates = rev(g.coordinates);
    else g.coordinates = g.coordinates.map(rev);
  }
  return f;
}

function bboxOfPath(d) {
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n.length; i += 2) {
    b[0] = Math.min(b[0], n[i]);
    b[2] = Math.max(b[2], n[i]);
    b[1] = Math.min(b[1], n[i + 1]);
    b[3] = Math.max(b[3], n[i + 1]);
  }
  return b.map((v) => Math.round(v * 10) / 10);
}

// Radial-distance decimation on an absolute M/L/Z path; drops rings that collapse.
function simplifyD(d, tol, dg = 10) {
  const rd = (v) => Math.round(v * dg) / dg;
  return d
    .split("Z")
    .filter((r) => r.trim())
    .map((r) => {
      const pts = r
        .replace(/^M/, "")
        .split("L")
        .map((p) => p.split(",").map(Number));
      const kept = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const l = kept[kept.length - 1];
        if (Math.hypot(pts[i][0] - l[0], pts[i][1] - l[1]) >= tol) kept.push(pts[i]);
      }
      return kept.length < 3
        ? ""
        : "M" + kept.map((p) => rd(p[0]) + "," + rd(p[1])).join("L") + "Z";
    })
    .join("");
}

// Regions whose boxes touch (with a little slack) count as neighbours.
function neighbours(regions) {
  const ks = Object.keys(regions);
  for (const a of ks) {
    const A = regions[a].bb;
    regions[a].nb = ks.filter((b) => {
      if (b === a) return false;
      const B = regions[b].bb;
      const p = 3;
      return A[0] - p <= B[2] && B[0] - p <= A[2] && A[1] - p <= B[3] && B[1] - p <= A[3];
    });
  }
}

function write(name, geo) {
  fs.mkdirSync(OUT, { recursive: true });
  const out = JSON.stringify(geo);
  fs.writeFileSync(path.join(OUT, name), out);
  const units = Object.values(geo.units).reduce((n, u) => n + u.length, 0);
  console.log(`${name}: ${(out.length / 1024).toFixed(0)} KB, ${units} sub-units`);
}

// ---------------- UK ----------------
// The constituency shards share one projection, so they are scaled into the
// frame together; the NUTS1 outlines are fitted to the same extent.
function buildUk() {
  const dir = path.join(ROOT, "src/data/subdivisions/uk");
  const NAMES = {
    LON: "London",
    SEE: "South East England",
    SWE: "South West England",
    EAE: "East of England",
    EMI: "East Midlands",
    WMI: "West Midlands",
    YHU: "Yorkshire and the Humber",
    NWE: "North West England",
    NEE: "North East England",
    SCO: "Scotland",
    WAL: "Wales",
    NIR: "Northern Ireland",
  };
  const shards = {};
  const gb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const code of Object.keys(NAMES)) {
    const x = JSON.parse(fs.readFileSync(path.join(dir, `${code}.json`), "utf8"));
    shards[code] = x.subdivisions.map((s) => {
      const rings = s.path
        .split("Z")
        .filter((r) => r.trim())
        .map((r) =>
          r
            .replace(/^M/, "")
            .split("L")
            .map((p) => p.split(",").map(Number))
        );
      for (const r of rings)
        for (const [px, py] of r) {
          gb[0] = Math.min(gb[0], px);
          gb[2] = Math.max(gb[2], px);
          gb[1] = Math.min(gb[1], py);
          gb[3] = Math.max(gb[3], py);
        }
      return { id: s.id, n: s.name, rings };
    });
  }
  const s = Math.min((W - 2 * PAD) / (gb[2] - gb[0]), (H - 2 * PAD) / (gb[3] - gb[1]));
  const ox = (W - (gb[2] - gb[0]) * s) / 2 - gb[0] * s;
  const oy = (H - (gb[3] - gb[1]) * s) / 2 - gb[1] * s;
  // London's seats are tiny at national scale, Scotland's huge: tolerance per region.
  const TOL = { LON: 0.05, SCO: 0.5, NIR: 0.22 };
  const units = {};
  for (const code of Object.keys(shards)) {
    const tol = TOL[code] ?? 0.2;
    const dg = code === "LON" ? 100 : 10;
    const rd = (v) => Math.round(v * dg) / dg;
    units[code] = shards[code].map((u) => {
      let d = "";
      for (const r of u.rings) {
        const pts = r.map(([px, py]) => [px * s + ox, py * s + oy]);
        const kept = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const l = kept[kept.length - 1];
          if (Math.hypot(pts[i][0] - l[0], pts[i][1] - l[1]) >= tol) kept.push(pts[i]);
        }
        if (kept.length < 3) continue;
        const rb = bboxOfPath(kept.flat().join(" "));
        // Drop slivers of multi-ring seats; a single-ring seat always keeps its shape.
        if ((rb[2] - rb[0]) * (rb[3] - rb[1]) < tol * tol * 6 && u.rings.length > 1) continue;
        d += "M" + kept.map((p) => rd(p[0]) + "," + rd(p[1])).join("L") + "Z";
      }
      // A seat thinned to nothing still needs a shape to click: keep its first ring raw.
      if (!d) {
        const r = u.rings[0].map(([px, py]) => [px * s + ox, py * s + oy]);
        d = "M" + r.map((p) => rd(p[0]) + "," + rd(p[1])).join("L") + "Z";
      }
      return { id: u.id, n: u.n, d };
    });
  }
  const nuts = JSON.parse(fs.readFileSync(path.join(ROOT, "public/uk-nuts1.json"), "utf8"));
  nuts.features.forEach(rewind);
  const proj = geoConicConformal()
    .parallels([50, 60])
    .rotate([2, 0])
    .fitExtent(
      [
        [gb[0] * s + ox, gb[1] * s + oy],
        [gb[2] * s + ox, gb[3] * s + oy],
      ],
      nuts
    );
  const pathGen = geoPath(proj).digits(1);
  const NUTS = {
    UKK: "SWE",
    UKJ: "SEE",
    UKI: "LON",
    UKH: "EAE",
    UKL: "WAL",
    UKG: "WMI",
    UKF: "EMI",
    UKE: "YHU",
    UKD: "NWE",
    UKN: "NIR",
    UKC: "NEE",
    UKM: "SCO",
  };
  const regions = {};
  for (const f of nuts.features) {
    const code = NUTS[f.properties.id];
    if (!code) continue;
    // The zoom box comes from the constituencies: they are what the map draws.
    let bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const u of units[code]) {
      const b = bboxOfPath(u.d);
      bb = [
        Math.min(bb[0], b[0]),
        Math.min(bb[1], b[1]),
        Math.max(bb[2], b[2]),
        Math.max(bb[3], b[3]),
      ];
    }
    regions[code] = { n: NAMES[code], d: simplifyD(pathGen(f), 0.3), bb };
  }
  neighbours(regions);
  write("uk.json", { w: W, h: H, regions, units });
}

// ---------------- JP ----------------
// Each game region's prefecture shard is fitted separately in the game data,
// so the prefectures are re-projected here from the national topojson. Okinawa
// and Amami go in a framed inset; the far Pacific islands are dropped.
function buildJp() {
  const src = fs.readFileSync(
    path.join(ROOT, "src/lib/countries/jp/data/jpRegionDirectory.ts"),
    "utf8"
  );
  const prefs = [
    ...src.matchAll(/\{ id: (\d+), name: "([^"]+)", regionId: "([A-Z]+)", population: ([\d_]+)/g),
  ].map((m) => ({ id: +m[1], n: m[2], r: m[3] }));
  if (prefs.length !== 47) throw new Error(`expected 47 prefectures, got ${prefs.length}`);
  const NAMES = {
    HOK: "Hokkaido",
    TOH: "Tohoku",
    KAN: "Kanto",
    CHU: "Chubu",
    KNS: "Kansai",
    CGK: "Chugoku",
    SHI: "Shikoku",
    KYU: "Kyushu and Okinawa",
  };
  const t = JSON.parse(fs.readFileSync(path.join(ROOT, "public/japan-prefectures.json"), "utf8"));
  const fc = topo.feature(t, t.objects.japan);
  const split = {};
  for (const f of fc.features) {
    rewind(f);
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const main = [];
    const inset = [];
    for (const p of polys) {
      const b = geoBounds({ type: "Polygon", coordinates: p });
      const lat = (b[0][1] + b[1][1]) / 2;
      const lon = (b[0][0] + b[1][0]) / 2;
      if (lat >= 30.6 && lon <= 146.5) main.push(p);
      else if (lat < 30.6 && lon < 132) inset.push(p);
    }
    split[f.properties.id] = {
      main: main.length
        ? { type: "Feature", geometry: { type: "MultiPolygon", coordinates: main } }
        : null,
      inset: inset.length
        ? { type: "Feature", geometry: { type: "MultiPolygon", coordinates: inset } }
        : null,
    };
  }
  const mainFC = {
    type: "FeatureCollection",
    features: Object.values(split)
      .map((x) => x.main)
      .filter(Boolean),
  };
  const insetFC = {
    type: "FeatureCollection",
    features: Object.values(split)
      .map((x) => x.inset)
      .filter(Boolean),
  };
  const proj = geoMercator().fitExtent(
    [
      [PAD + 150, PAD],
      [W - PAD, H - PAD],
    ],
    mainFC
  );
  const pathGen = geoPath(proj).digits(1);
  const ip = geoMercator()
    .scale(proj.scale() * 0.55)
    .translate([0, 0]);
  const ib = geoPath(ip).bounds(insetFC);
  const ix = 30;
  const iy = 30;
  ip.translate([ix - ib[0][0], iy - ib[0][1]]);
  const ipath = geoPath(ip).digits(1);
  const iw = ib[1][0] - ib[0][0];
  const ih = ib[1][1] - ib[0][1];
  const frame = `M${ix - 10},${iy - 10}H${(ix + iw + 10).toFixed(1)}V${(iy + ih + 10).toFixed(1)}`;
  const units = {};
  const regions = {};
  for (const code of Object.keys(NAMES)) {
    units[code] = prefs
      .filter((p) => p.r === code)
      .map((p) => {
        const x = split[p.id];
        const d = (x.main ? pathGen(x.main) : "") + (x.inset ? ipath(x.inset) : "");
        return { id: "JP-" + String(p.id).padStart(2, "0"), n: p.n, d: simplifyD(d, 0.35) };
      });
    const ids = prefs.filter((p) => p.r === code).map((p) => p.id);
    const geoms = t.objects.japan.geometries.filter((g) => ids.includes(g.properties.id));
    const merged = rewind({ type: "Feature", geometry: topo.merge(t, geoms) });
    const polys = merged.geometry.coordinates.filter((p) => {
      const b = geoBounds({ type: "Polygon", coordinates: p });
      return (b[0][1] + b[1][1]) / 2 >= 30.6 && (b[0][0] + b[1][0]) / 2 <= 146.5;
    });
    const mf = { type: "Feature", geometry: { type: "MultiPolygon", coordinates: polys } };
    const bb = geoPath(proj).bounds(mf);
    regions[code] = {
      n: NAMES[code],
      d: simplifyD(pathGen(mf), 0.35),
      bb: [bb[0][0], bb[0][1], bb[1][0], bb[1][1]].map((v) => Math.round(v * 10) / 10),
    };
  }
  neighbours(regions);
  write("jp.json", { w: W, h: H, regions, units, frame });
}

buildUk();
buildJp();
