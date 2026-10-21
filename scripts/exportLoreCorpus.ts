#!/usr/bin/env tsx
/**
 * Export the A House Divided lore corpus to one JSON artifact.
 *
 * The corpus is the world's authored prose, gathered from the modules the game
 * already ships: country taglines and descriptors per era, the world entity
 * registry (recognition notes, UN records, author notes), international
 * organisation descriptions and charters, the authored historical crisis
 * entries, the player wiki, the glossary and the major-party blurbs.
 *
 * Nothing here is invented. Every string comes from a game module, so the
 * corpus cannot drift from the game: regenerate it and it matches the commit
 * it was generated from, and the artifact records that commit.
 *
 * The consumer is the lore MCP server on the ops box, which serves the corpus
 * to agents as callable tools and as MCP resources. The game itself never
 * reads the artifact: the corpus is a read-only projection of the game, not a
 * second copy of the truth.
 *
 * Usage:
 *   npx tsx scripts/exportLoreCorpus.ts --out <path> [--pretty]
 *
 * Flags:
 *   --out <path>   Where to write the JSON artifact. Required.
 *   --pretty       Write indented JSON instead of compact JSON.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ALL_COUNTRY_IDS, getCountryConfig } from "@/lib/constants/countries";
import { SHIPPING_PRESETS } from "@/lib/world/eraRoster";
import { getWorldEntityPresetManifest } from "@/lib/world/worldEntityManifest";
import { INTERNATIONAL_ORGANIZATIONS } from "@/lib/constants/internationalOrganizations";
import { HISTORICAL_CRISIS_SHOWCASE } from "@/components/landing/historicalCrisisShowcase";
import { WIKI_SEED_PAGES } from "@/lib/seeds/wiki/pages";
import { WIKI_GLOSSARY } from "@/lib/seeds/wiki/glossary";
import { getPartyFlavor } from "@/lib/wiki/partyFlavor";

interface LoreCountryEra {
  preset: string;
  name: string;
  flagEmoji: string;
  governmentType: string;
  governmentTypeLabel: string;
  executiveTitle: string;
  tagline: string;
  descriptor: string;
}

interface LoreCountry {
  id: string;
  name: string;
  code: string;
  flagEmoji: string;
  regionLabel: string;
  regionLabelPlural: string;
  status: string;
  governmentType: string;
  governmentTypeLabel: string;
  executiveTitle: string;
  headOfStateTitle: string | null;
  currencyCode: string;
  tagline: string;
  descriptor: string;
  eras: LoreCountryEra[];
}

interface LoreWorldEntity {
  entityId: string;
  displayName: string;
  presetId: string;
  status: string;
  region: string | null;
  simulationTier: string;
  economicArchetype: string;
  parentEntityId: string | null;
  coParentEntityIds: string[];
  exceptionalStatus: string | null;
  recognitionStatus: string | null;
  recognitionNotes: string | null;
  unState: string | null;
  unMemberSinceYear: number | null;
  unExpectedAdmissionYear: number | null;
  lifecycle: {
    earliestYear: number | null;
    expectedYear: number | null;
    latestYear: number | null;
  };
  authorNotes: string[];
  mapFeatureIds: string[];
}

interface LoreOrganization {
  id: string;
  name: string;
  description: string;
  charter: string;
}

interface LoreHistoricalEvent {
  id: string;
  year: number;
  countryId: string | null;
  title: string;
  description: string;
}

interface LoreWikiPage {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  countryId: string | null;
  featured: boolean;
  difficulty: string | null;
  contentType: string | null;
  content: string;
}

interface LoreGlossaryTerm {
  term: string;
  definition: string;
  aliases: string[];
}

interface LoreParty {
  key: string;
  blurb: string;
  tips: string[];
}

interface LoreCorpus {
  schemaVersion: number;
  generatedAt: string;
  source: { repo: string; commit: string | null; branch: string | null };
  presets: string[];
  countries: LoreCountry[];
  worldEntities: LoreWorldEntity[];
  organizations: LoreOrganization[];
  historicalEvents: LoreHistoricalEvent[];
  wiki: LoreWikiPage[];
  glossary: LoreGlossaryTerm[];
  parties: LoreParty[];
}

/**
 * The party keys the wiki has authored blurbs for. The flavor module keys its
 * registry by these names, so asking for each one returns the authored entry
 * rather than the generic fallback.
 */
const AUTHORED_PARTY_KEYS = [
  "democrat",
  "republican",
  "independent",
  "labour",
  "conservative",
  "liberal democrats",
  "scottish national party",
  "plaid cymru",
  "green party",
  "reform uk",
  "democratic unionist party",
  "sinn féin",
  "ulster unionist party",
  "liberal party",
];

function parseArgs(argv: string[]): { out: string; pretty: boolean } {
  let out = "";
  let pretty = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      out = String(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--pretty") {
      pretty = true;
    }
  }
  if (!out) {
    console.error("usage: npx tsx scripts/exportLoreCorpus.ts --out <path> [--pretty]");
    process.exit(2);
  }
  return { out: resolve(out), pretty };
}

function gitInfo(): { commit: string | null; branch: string | null } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
    const run = (args: string[]): string =>
      execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return {
      commit: run(["rev-parse", "HEAD"]) || null,
      branch: run(["rev-parse", "--abbrev-ref", "HEAD"]) || null,
    };
  } catch {
    return { commit: null, branch: null };
  }
}

function buildCountries(): LoreCountry[] {
  return ALL_COUNTRY_IDS.map((id) => {
    const base = getCountryConfig(id);
    const eras: LoreCountryEra[] = SHIPPING_PRESETS.map((preset) => {
      const config = getCountryConfig(id, preset);
      return {
        preset,
        name: config.name,
        flagEmoji: config.flagEmoji,
        governmentType: config.governmentType,
        governmentTypeLabel: config.governmentTypeLabel,
        executiveTitle: config.executiveTitle,
        tagline: config.tagline,
        descriptor: config.descriptor,
      };
    });
    return {
      id: base.id,
      name: base.name,
      code: base.code,
      flagEmoji: base.flagEmoji,
      regionLabel: base.regionLabel,
      regionLabelPlural: base.regionLabelPlural,
      status: base.status,
      governmentType: base.governmentType,
      governmentTypeLabel: base.governmentTypeLabel,
      executiveTitle: base.executiveTitle,
      headOfStateTitle: base.headOfStateTitle ?? null,
      currencyCode: base.currencyCode,
      tagline: base.tagline,
      descriptor: base.descriptor,
      eras,
    };
  });
}

function buildWorldEntities(): LoreWorldEntity[] {
  const rows: LoreWorldEntity[] = [];
  const seen = new Set<string>();
  for (const preset of SHIPPING_PRESETS) {
    let manifest;
    try {
      manifest = getWorldEntityPresetManifest(preset);
    } catch {
      continue;
    }
    for (const entry of manifest.entries) {
      const key = `${entry.presetId}:${entry.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        entityId: entry.entityId,
        displayName: entry.displayName,
        presetId: entry.presetId,
        status: entry.status,
        region: entry.region ?? null,
        simulationTier: entry.simulationTier,
        economicArchetype: entry.economicArchetype,
        parentEntityId: entry.parentEntityId ?? null,
        coParentEntityIds: [...(entry.coParentEntityIds ?? [])],
        exceptionalStatus: entry.exceptionalStatus ?? null,
        recognitionStatus: entry.recognition?.status ?? null,
        recognitionNotes: entry.recognition?.notes ?? null,
        unState: entry.un?.state ?? null,
        unMemberSinceYear: entry.un?.memberSinceYear ?? null,
        unExpectedAdmissionYear: entry.un?.expectedAdmissionYear ?? null,
        lifecycle: {
          earliestYear: entry.lifecycle?.earliestYear ?? null,
          expectedYear: entry.lifecycle?.expectedYear ?? null,
          latestYear: entry.lifecycle?.latestYear ?? null,
        },
        authorNotes: [...(entry.readiness?.flavorGaps ?? [])],
        mapFeatureIds: [...(entry.mapFeatureIds ?? [])],
      });
    }
  }
  return rows;
}

function buildOrganizations(): LoreOrganization[] {
  return Object.values(INTERNATIONAL_ORGANIZATIONS).map((org) => ({
    id: org.id,
    name: org.name,
    description: org.description,
    charter: org.charter,
  }));
}

function buildHistoricalEvents(): LoreHistoricalEvent[] {
  return HISTORICAL_CRISIS_SHOWCASE.map((entry) => ({
    id: entry.id,
    year: entry.year,
    countryId: entry.countryId ?? null,
    title: entry.title,
    description: entry.description,
  }));
}

function buildWiki(): LoreWikiPage[] {
  return WIKI_SEED_PAGES.map((page) => ({
    slug: page.slug,
    title: page.title,
    description: page.description,
    category: page.category,
    tags: [...(page.extraTags ?? [])],
    countryId: page.countryId ?? null,
    featured: Boolean(page.featured),
    difficulty: page.difficulty ?? null,
    contentType: page.contentType ?? null,
    content: page.content,
  }));
}

function buildGlossary(): LoreGlossaryTerm[] {
  return Object.entries(WIKI_GLOSSARY).map(([term, entry]) => ({
    term,
    definition: entry.definition,
    aliases: [...(entry.aliases ?? [])],
  }));
}

function buildParties(): LoreParty[] {
  return AUTHORED_PARTY_KEYS.map((key) => {
    const flavor = getPartyFlavor(key, key);
    return { key, blurb: flavor.blurb, tips: [...flavor.tips] };
  });
}

function main(): void {
  const { out, pretty } = parseArgs(process.argv.slice(2));
  const source = gitInfo();
  const corpus: LoreCorpus = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: { repo: "AHDGame", commit: source.commit, branch: source.branch },
    presets: [...SHIPPING_PRESETS],
    countries: buildCountries(),
    worldEntities: buildWorldEntities(),
    organizations: buildOrganizations(),
    historicalEvents: buildHistoricalEvents(),
    wiki: buildWiki(),
    glossary: buildGlossary(),
    parties: buildParties(),
  };
  writeFileSync(out, `${JSON.stringify(corpus, null, pretty ? 2 : 0)}\n`, "utf8");
  const bytes = Buffer.byteLength(JSON.stringify(corpus));
  console.log(
    `lore corpus written: ${out} (${bytes} bytes; ${corpus.countries.length} countries, ` +
      `${corpus.worldEntities.length} world entities, ${corpus.organizations.length} organisations, ` +
      `${corpus.historicalEvents.length} historical events, ${corpus.wiki.length} wiki pages, ` +
      `${corpus.glossary.length} glossary terms, ${corpus.parties.length} party blurbs)`
  );
}

main();
