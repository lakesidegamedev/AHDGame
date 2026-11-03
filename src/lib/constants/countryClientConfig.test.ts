import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALL_COUNTRY_IDS,
  COUNTRY_CONFIGS,
  DEFAULT_LEGACY_COUNTRY_ID,
  ERA_COUNTRY_CONFIG_OVERRIDES,
  ERA_COUNTRY_NAMES,
  getCountryConfig,
  getCountryDisplayName,
  getCountryIdByName,
  getExecutiveOrderName,
  getExecutiveOrderNamePlural,
  getNationalAddressName,
  getOfficeTypeConfig,
  getRegionalBillAssentTitle,
  getRegionalBillAssentTitleForState,
  getRegionalExecutiveOfficeKey,
  getSubNationalLegislatureKey,
  type CountryId,
} from "./countries";
import {
  ALL_COUNTRY_IDS as CLIENT_ALL_COUNTRY_IDS,
  COUNTRY_CLIENT_CONFIGS,
  DEFAULT_LEGACY_COUNTRY_ID as CLIENT_DEFAULT_LEGACY_COUNTRY_ID,
  getCountryClientConfig,
  getCountryDisplayName as getClientCountryDisplayName,
  getCountryIdByName as getClientCountryIdByName,
  getExecutiveOrderName as getClientExecutiveOrderName,
  getExecutiveOrderNamePlural as getClientExecutiveOrderNamePlural,
  getNationalAddressName as getClientNationalAddressName,
  getOfficeTypeConfig as getClientOfficeTypeConfig,
  getRegionalBillAssentTitle as getClientRegionalBillAssentTitle,
  getRegionalBillAssentTitleForState as getClientRegionalBillAssentTitleForState,
  getRegionalExecutiveOfficeKey as getClientRegionalExecutiveOfficeKey,
  getSubNationalLegislatureKey as getClientSubNationalLegislatureKey,
} from "./countryClientConfig";

/**
 * The client projection must stay a faithful copy of the full registry.
 *
 * ⚠️ WHY THIS TEST EXISTS. `countryClientConfig.ts` is generated from
 * `COUNTRY_CONFIGS`, and the generator is the only thing keeping the two in
 * step. A seed edit that changes a country's name, chamber seats or office
 * labels would otherwise ship a stale client copy with no failure anywhere:
 * the browser simply renders the old value while the server renders the new
 * one. Regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-client-config.ts
 *
 * ⚠️ IT WALKS THE PROJECTED VALUE, NOT A FIELD LIST. Listing the fields here
 * would be a second copy of the generator's contract, and the copy that goes
 * stale first. Whatever the generated file carries is compared, leaf by leaf,
 * including arrays and per-era overrides.
 */
const REGENERATE = "npx tsx scripts/countries/gen-country-client-config.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectMismatches(
  full: unknown,
  client: unknown,
  path: string,
  mismatches: string[]
): void {
  if (Array.isArray(client)) {
    if (!Array.isArray(full)) {
      mismatches.push(`${path}: client value is an array, registry value is not`);
      return;
    }
    if (full.length !== client.length) {
      mismatches.push(`${path}: client has ${client.length} entries, registry has ${full.length}`);
      return;
    }
    client.forEach((entry, index) =>
      collectMismatches(full[index], entry, `${path}[${index}]`, mismatches)
    );
    return;
  }
  if (isPlainObject(client)) {
    if (!isPlainObject(full)) {
      mismatches.push(`${path}: client value is an object, registry value is not`);
      return;
    }
    for (const [key, value] of Object.entries(client)) {
      if (!Object.hasOwn(full, key)) {
        mismatches.push(`${path}.${key}: the registry has no such field`);
        continue;
      }
      collectMismatches(full[key], value, `${path}.${key}`, mismatches);
    }
    return;
  }
  if (!Object.is(full, client)) {
    mismatches.push(
      `${path}: client ${JSON.stringify(client)} != registry ${JSON.stringify(full)}`
    );
  }
}

function expectParity(full: unknown, client: unknown, label: string): void {
  const mismatches: string[] = [];
  collectMismatches(full, client, label, mismatches);
  expect(
    mismatches,
    `\n${label} drifted from the full country registry in ${mismatches.length} place(s):\n` +
      mismatches.map((m) => `  ${m}`).join("\n") +
      `\n\ncountryClientConfig.ts is generated. Regenerate it:\n\n  ${REGENERATE}\n`
  ).toEqual([]);
}

const COUNTRY_IDS = Object.keys(COUNTRY_CONFIGS) as CountryId[];
const PRESETS = Object.keys(ERA_COUNTRY_CONFIG_OVERRIDES);

describe("countryClientConfig matches the full registry", () => {
  it("has exactly the same country keys", () => {
    expect(Object.keys(COUNTRY_CLIENT_CONFIGS).sort()).toEqual([...COUNTRY_IDS].sort());
    expect([...CLIENT_ALL_COUNTRY_IDS].sort()).toEqual([...COUNTRY_IDS].sort());
    expect(CLIENT_ALL_COUNTRY_IDS).toEqual(ALL_COUNTRY_IDS);
    expect(CLIENT_DEFAULT_LEGACY_COUNTRY_ID).toBe(DEFAULT_LEGACY_COUNTRY_ID);
  });

  it.each(COUNTRY_IDS)("%s carries the same value for every projected field", (id) => {
    expectParity(COUNTRY_CONFIGS[id], COUNTRY_CLIENT_CONFIGS[id], id);
  });

  it.each(PRESETS)("%s era overrides cover only projections that differ", (preset) => {
    const overridden = COUNTRY_IDS.filter(
      (id) => ERA_COUNTRY_CONFIG_OVERRIDES[preset]?.[id] !== undefined
    );
    // Guards the guard: a preset that silently lost its override rows would
    // otherwise pass this test while checking nothing.
    expect(overridden.length).toBeGreaterThan(0);
    for (const id of overridden) {
      expectParity(
        getCountryConfig(id, preset),
        getCountryClientConfig(id, preset),
        `${preset}.${id}`
      );
    }
  });

  it("is not the whole registry under a new name", () => {
    // The union exists to keep country era, policy, party and cabinet data out
    // of the browser bundle. If a heavy field ever appears here, the projection
    // has been widened by accident.
    const us = COUNTRY_CLIENT_CONFIGS.US;
    expect(us).not.toHaveProperty("policyAxisEffects");
    expect(us).not.toHaveProperty("popularMoodProfile");
    expect(us).not.toHaveProperty("priorityProfile");
    expect(us).not.toHaveProperty("tagline");
    expect(us).not.toHaveProperty("capital");
  });
});

describe("client country helpers match the full registry", () => {
  const presets = [undefined, ...PRESETS, "no-such-preset"] as const;

  it.each(COUNTRY_IDS)("%s resolves the same display name in every era", (id) => {
    for (const preset of presets) {
      expect(getClientCountryDisplayName(id, preset)).toBe(getCountryDisplayName(id, preset));
    }
    // Every era alias is exercised, not just the presets the override table knows.
    for (const preset of Object.keys(ERA_COUNTRY_NAMES)) {
      expect(getClientCountryDisplayName(id, preset)).toBe(getCountryDisplayName(id, preset));
    }
  });

  it.each(COUNTRY_IDS)("%s resolves the same order, address and office labels", (id) => {
    expect(getClientExecutiveOrderName(id)).toBe(getExecutiveOrderName(id));
    expect(getClientExecutiveOrderNamePlural(id)).toBe(getExecutiveOrderNamePlural(id));
    expect(getClientNationalAddressName(id)).toBe(getNationalAddressName(id));
    expect(getClientSubNationalLegislatureKey(id)).toBe(getSubNationalLegislatureKey(id));
    expect(getClientRegionalExecutiveOfficeKey(id)).toBe(getRegionalExecutiveOfficeKey(id));
    expect(getClientRegionalBillAssentTitle(id)).toBe(getRegionalBillAssentTitle(id));

    for (const preset of [undefined, ...PRESETS]) {
      const full = getCountryConfig(id, preset);
      for (const office of full.officeTypes) {
        expect(getClientOfficeTypeConfig(id, office.key, preset)?.label).toBe(
          getOfficeTypeConfig(id, office.key, preset)?.label
        );
      }
      expect(getClientOfficeTypeConfig(id, "noSuchOffice", preset)).toBeUndefined();
    }
  });

  it("resolves the same state-aware regional executive title", () => {
    const states = [
      undefined,
      null,
      "LON",
      "lon",
      "DUB",
      "COR",
      "LIM",
      "GAL",
      "BUD",
      "CA",
    ] as const;
    for (const id of COUNTRY_IDS) {
      for (const state of states) {
        expect(getClientRegionalBillAssentTitleForState(id, state)).toBe(
          getRegionalBillAssentTitleForState(id, state)
        );
      }
    }
  });

  it("resolves the same id from every configured country name", () => {
    for (const id of COUNTRY_IDS) {
      const name = COUNTRY_CONFIGS[id].name;
      expect(getClientCountryIdByName(name)).toBe(getCountryIdByName(name));
    }
    expect(getClientCountryIdByName("Not A Country")).toBe(getCountryIdByName("Not A Country"));
  });
});

describe("client modules import the projection, not the registry", () => {
  /**
   * The point of this module is the browser bundle, and a single
   * `"use client"` import of the full registry puts all of it back. This is
   * the direct-import half only; the transitive half belongs to the
   * architecture audit and to `src/lib/countries/clientSafeLeafModules.test.ts`.
   */
  const ROOTS = ["src/app", "src/components", "src/hooks", "src/contexts", "src/lib"];

  function sourceFiles(dir: string): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }
    return entries.flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry) && !entry.includes(".test.") ? [full.split("\\").join("/")] : [];
    });
  }

  it("has no use client module importing the full registry", () => {
    const files = ROOTS.flatMap(sourceFiles);
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      const head = source.trimStart();
      if (!head.startsWith('"use client"') && !head.startsWith("'use client'")) return false;
      return /from\s+["']@\/lib\/constants\/countries["']/.test(source);
    });
    expect(
      offenders,
      `\n${offenders.length} client module(s) still import the full country registry:\n` +
        offenders.map((f) => `  ${f}`).join("\n") +
        `\n\nImport COUNTRY_CLIENT_CONFIGS / getCountryClientConfig from\n` +
        `@/lib/constants/countryClientConfig, or types from\n` +
        `@/lib/constants/countriesCore. The full registry pulls 29 country\n` +
        `institution modules and every era file into the browser bundle.\n`
    ).toEqual([]);
  }, 60_000);
});
