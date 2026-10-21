#!/usr/bin/env tsx
/**
 * Export the seed audit's reference data from the game repo.
 *
 * The seed audit MCP answers "is this world's seed data complete?". To answer
 * that it needs to know what the game expects: which corporation types exist,
 * which countries have a central bank, and which countries are in each era's
 * world. Until 2026-10-21 it kept that list as a hand-typed copy, marked
 * "mirrored 2026-07-22, refresh manually if the game list changes" — and it
 * had drifted: the game had dropped two corporation types (so the audit
 * reported every state as incomplete) and gained six forex-active countries
 * (so their central banks were never checked at all).
 *
 * This script writes the game's own constants instead, so the audit cannot
 * check against a list the game has moved past.
 *
 * Usage:
 *   npx tsx scripts/exportSeedAuditReference.ts --out <path> [--pretty]
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { CORPORATION_TYPES } from "@/lib/constants/corporations";
import { FOREX_ACTIVE_COUNTRIES } from "@/lib/constants/currencies";
import { ERA_ROSTER, SHIPPING_PRESETS } from "@/lib/world/eraRoster";

interface PresetReference {
  /** Countries a player can take a seat in. */
  player: string[];
  /** Countries seeded as economy-only. */
  econ: string[];
  /** Countries seeded and run by themselves. */
  npp: string[];
  /** Seeded but deliberately held out of the country list. */
  latent: string[];
}

interface SeedAuditReference {
  schemaVersion: number;
  generatedAt: string;
  source: { repo: string; commit: string | null; branch: string | null };
  corporationTypes: string[];
  forexActiveCountries: string[];
  presets: Record<string, PresetReference>;
}

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
    console.error("usage: npx tsx scripts/exportSeedAuditReference.ts --out <path> [--pretty]");
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

function main(): void {
  const { out, pretty } = parseArgs(process.argv.slice(2));
  const source = gitInfo();

  const presets: Record<string, PresetReference> = {};
  for (const preset of SHIPPING_PRESETS) {
    const roster = ERA_ROSTER[preset];
    if (!roster) continue;
    presets[preset] = {
      player: [...(roster.player ?? [])],
      econ: [...(roster.econ ?? [])],
      npp: [...(roster.npp ?? [])],
      latent: [...(roster.latent ?? [])],
    };
  }

  const reference: SeedAuditReference = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: { repo: "AHDGame", commit: source.commit, branch: source.branch },
    corporationTypes: [...CORPORATION_TYPES],
    forexActiveCountries: [...FOREX_ACTIVE_COUNTRIES],
    presets,
  };

  writeFileSync(out, `${JSON.stringify(reference, null, pretty ? 2 : 0)}\n`, "utf8");
  console.log(
    `seed audit reference written: ${out} (${reference.corporationTypes.length} corporation types, ` +
      `${reference.forexActiveCountries.length} forex-active countries, ${Object.keys(reference.presets).length} presets)`
  );
}

main();
