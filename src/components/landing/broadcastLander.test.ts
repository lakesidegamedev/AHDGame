import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as topojson from "topojson-client";
import topo from "../../../public/geo/countries-110m.json";
import { ERA_CONFIGS, SOVIET_REPUBLIC_FEATURE_IDS } from "./eraThemes";
import { HISTORICAL_CRISIS_SHOWCASE } from "./historicalCrisisShowcase";
import { dissolvedStateGeometry } from "./broadcastGlobe";

const DASHES = /[–—]/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const broadcast = ERA_CONFIGS["1991"].broadcast!;

const topology = topo as any;

describe("1991 broadcast lander content", () => {
  it("exists for 1991 and never stacks with the CRT look", () => {
    expect(broadcast).toBeDefined();
    for (const config of Object.values(ERA_CONFIGS)) {
      expect(Boolean(config.broadcast && config.wireframeColor), config.id).toBe(false);
    }
  });

  it("runs the crawl oldest first, with the orbit item last", () => {
    const dated = broadcast.ticker.filter((item) => item.date !== "In orbit");
    const order = dated.map((item) => {
      const [day, month] = item.date.split(" ");
      expect(MONTHS, item.date).toContain(month);
      return MONTHS.indexOf(month) * 100 + Number(day);
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(broadcast.ticker[broadcast.ticker.length - 1].date).toBe("In orbit");
  });

  it("files every dated headline from a real place", () => {
    for (const item of broadcast.ticker) {
      if (item.date === "In orbit") {
        expect(item.place).toBeUndefined();
        continue;
      }
      expect(item.place, item.text).toBeDefined();
      const [lon, lat] = item.place!.lonLat;
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
  });

  it("tours 1991 itself when idle, not the Cold War from 1953", () => {
    expect(broadcast.showcase.length).toBeGreaterThan(5);
    expect(new Set(broadcast.showcase.map((entry) => entry.id)).size).toBe(
      broadcast.showcase.length
    );
    for (const entry of broadcast.showcase) {
      expect(entry.year, entry.id).toBe(1991);
      expect(entry.title).not.toMatch(DASHES);
      expect(entry.description).not.toMatch(DASHES);
      const [lon, lat] = entry.lonLat;
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
    expect(broadcast.showcaseBadge).toBe("Special report");
  });

  it("highlights the era year inside the headline", () => {
    expect(ERA_CONFIGS["1991"].heroHeadline).toContain("1991");
  });

  it("links the 1991 world explainer on the studio site", () => {
    const explainer = ERA_CONFIGS["1991"].explainer!;
    expect(new URL(explainer.href).origin).toBe("https://lakesidegames.net");
    expect(new URL(explainer.href).pathname).toBe("/ahd-1991/");
    expect(explainer.label).toContain("1991");
  });

  it("keeps em and en dashes out of the copy players read", () => {
    const copy = [
      broadcast.orbitLabel,
      ...broadcast.ticker.flatMap((item) => [item.date, item.text, item.place?.name ?? ""]),
      ...Object.values(ERA_CONFIGS).flatMap((config) => [
        config.loginTagline,
        config.heroHeadline,
        config.heroDek,
        config.explainer?.label ?? "",
      ]),
      ...HISTORICAL_CRISIS_SHOWCASE.flatMap((entry) => [entry.title, entry.description]),
    ];
    for (const text of copy) expect(text, text).not.toMatch(DASHES);
  });
});

describe("the dissolved Soviet Union", () => {
  it("names all fifteen republics, each present on the map", () => {
    expect(new Set(SOVIET_REPUBLIC_FEATURE_IDS).size).toBe(15);
    const onMap = new Set(
      topology.objects.countries.geometries.map((g: { id: unknown }) => String(g.id))
    );
    for (const id of SOVIET_REPUBLIC_FEATURE_IDS) expect(onMap.has(id), id).toBe(true);
    expect(broadcast.dissolvedStateFeatureIds).toBe(SOVIET_REPUBLIC_FEATURE_IDS);
  });

  it("draws an outer outline and the borders between republics as separate meshes", () => {
    const geometry = dissolvedStateGeometry(topojson.mesh, topology, SOVIET_REPUBLIC_FEATURE_IDS);
    expect(geometry).not.toBeNull();
    const { outline, seams } = geometry!;
    expect(outline.type).toBe("MultiLineString");
    expect(outline.coordinates.length).toBeGreaterThan(0);
    expect(seams.coordinates.length).toBeGreaterThan(0);

    // The Russia and Ukraine border is a seam, never part of the outline.
    const russiaUkraine = topojson.mesh(
      topology,
      topology.objects.countries,
      (a, b) =>
        a !== b && [String(a.id), String(b.id)].sort().join() === ["643", "804"].sort().join()
    );
    const key = (p: number[]) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
    const seamPoints = new Set(seams.coordinates.flat().map(key));
    const outlinePoints = new Set(outline.coordinates.flat().map(key));
    // Interior vertices only: where the border meets the coast is on the outline.
    const border = russiaUkraine.coordinates.flatMap((line) => line.slice(1, -1)).map(key);
    expect(border.length).toBeGreaterThan(2);
    for (const point of border) {
      expect(seamPoints.has(point)).toBe(true);
      expect(outlinePoints.has(point)).toBe(false);
    }
  });

  it("draws nothing for an empty or unknown roster", () => {
    expect(dissolvedStateGeometry(topojson.mesh, topology, [])).toBeNull();
    expect(dissolvedStateGeometry(topojson.mesh, topology, ["nowhere"])).toBeNull();
  });
});

describe("2027 broadcast lander content", () => {
  const config = ERA_CONFIGS["2027"];
  const lander = config.broadcast!;
  const yearOf = (date: string) => Number(/\d{4}/.exec(date)?.[0]);

  it("is a broadcast lander with no dissolved state", () => {
    expect(lander).toBeDefined();
    expect(config.wireframeColor).toBeNull();
    expect(lander.dissolvedStateFeatureIds ?? []).toEqual([]);
    expect(lander.showcaseBadge).toBe("Looking ahead");
  });

  it("runs the crawl oldest first from January 2027 to 2050, orbit item last", () => {
    const dated = lander.ticker.filter((item) => item.date !== "In orbit");
    const years = dated.map((item) => yearOf(item.date));
    expect(years[0]).toBe(2027);
    expect(years[years.length - 1]).toBe(2050);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(lander.ticker[lander.ticker.length - 1].date).toBe("In orbit");
  });

  it("files every dated headline from a real place", () => {
    for (const item of lander.ticker) {
      if (item.date === "In orbit") {
        expect(item.place).toBeUndefined();
        continue;
      }
      expect(item.place, item.text).toBeDefined();
      const [lon, lat] = item.place!.lonLat;
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
  });

  it("tours the years ahead in date order, not the Cold War from 1953", () => {
    expect(lander.showcase.length).toBeGreaterThan(5);
    expect(new Set(lander.showcase.map((entry) => entry.id)).size).toBe(lander.showcase.length);
    const years = lander.showcase.map((entry) => entry.year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    for (const entry of lander.showcase) {
      expect(entry.year, entry.id).toBeGreaterThanOrEqual(2027);
      expect(entry.year, entry.id).toBeLessThanOrEqual(2050);
      const [lon, lat] = entry.lonLat;
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
  });

  it("highlights the era year inside the headline", () => {
    expect(config.heroHeadline).toContain("2027");
  });

  it("links the 2027 world overview and the November State of the Game post", () => {
    expect(config.explainer?.href).toBe("https://lakesidegames.net/ahd-2027/");
    expect(config.explainer?.labelKey).toBe("landing.world2027.overview");
    expect(config.newsPost?.href).toBe(
      "https://lakesidegames.net/news/state-of-the-game-november-2026/"
    );
    expect(config.newsPost?.labelKey).toBe("landing.world2027.stateOfTheGame");
  });

  it("draws the present-day globe: sunlight at the first turn, routes and Quebec", () => {
    const nightside = lander.nightside!;
    expect(nightside).toBeDefined();
    expect(Date.parse(nightside.sunAt)).toBe(Date.parse("2026-11-16T17:00:00-05:00"));
    expect(nightside.routes.length).toBeGreaterThanOrEqual(8);
    for (const { from, to } of nightside.routes) {
      expect(from.name).not.toBe(to.name);
      for (const [lon, lat] of [from.lonLat, to.lonLat]) {
        expect(Math.abs(lon)).toBeLessThanOrEqual(180);
        expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      }
    }
    // Both player countries and all four computer-run economies are on the network.
    const ends = new Set(nightside.routes.flatMap(({ from, to }) => [from.name, to.name]));
    for (const city of ["New York", "Toronto", "London", "Frankfurt", "Tokyo", "Shanghai"]) {
      expect(ends.has(city), city).toBe(true);
    }
    expect(nightside.watchedRegion?.featureId).toBe("CA_QC");
    expect(nightside.watchedRegion?.geoUrl).toBe("/ca-regions.json");
  });

  it("finds Quebec in the province shard the globe fetches", () => {
    const shard = JSON.parse(
      readFileSync(path.join(process.cwd(), "public/ca-regions.json"), "utf8")
    ) as { features: { properties: { regionCode: string }; geometry: { type: string } }[] };
    const quebec = shard.features.find((f) => f.properties.regionCode === "CA_QC");
    expect(quebec?.geometry.type).toMatch(/Polygon/);
  });

  it("keys the hero to the three tiers 2027 has, with their counts", () => {
    expect(lander.tierCounts).toEqual({ player: 2, economic: 4, background: 16 });
  });

  it("is the only era with the present-day globe", () => {
    for (const other of Object.values(ERA_CONFIGS)) {
      if (other.id !== "2027") expect(other.broadcast?.nightside, other.id).toBeUndefined();
    }
  });

  it("keeps dashes and real politicians out of the copy players read", () => {
    const copy = [
      lander.orbitLabel,
      config.label,
      config.heroDek,
      config.playSectionDek,
      config.worldSectionDek,
      ...config.eraChips,
      ...lander.ticker.flatMap((item) => [item.date, item.text, item.place?.name ?? ""]),
      ...lander.showcase.flatMap((entry) => [entry.title, entry.description]),
      ...Object.values(config.tileBodies ?? {}),
      config.explainer?.label ?? "",
      config.newsPost?.label ?? "",
      lander.nightside?.watchedRegion?.label ?? "",
    ];
    for (const text of copy) expect(text, text).not.toMatch(DASHES);
  });
});
