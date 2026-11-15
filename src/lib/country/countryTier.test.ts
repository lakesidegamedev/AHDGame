import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { COUNTRY_ORDER } from "@/lib/constants/countries";
import type { CountryGameState } from "@/lib/db/types/gameState";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { buildCountryTierSnapshot, getCountryTier, loadCountryTiers } from "./countryTier";
import { resolveCountryTier } from "./rules/countryTier";
import { getRegisteredCountryIds } from "./registeredCountries";

const row = (id: string, fields: Partial<CountryGameState>) =>
  ({ _id: id, ...fields }) as unknown as CountryGameState;

describe("resolveCountryTier", () => {
  it("answers absent for an unregistered country, whatever its row says", () => {
    expect(resolveCountryTier("DD", false, { _id: "DD", backgroundCountry: true })).toBe("absent");
  });

  it("puts a background row outside the full simulation, even when open to players", () => {
    expect(
      resolveCountryTier("FR", true, {
        _id: "FR",
        backgroundCountry: true,
        enabledForPlayers: true,
      })
    ).toBe("background");
  });

  it("treats the US and player-open rows as player, everything else as npp", () => {
    expect(resolveCountryTier("US", true, undefined)).toBe("player");
    expect(resolveCountryTier("UK", true, { _id: "UK", enabledForPlayers: true })).toBe("player");
    expect(resolveCountryTier("UK", true, { _id: "UK" })).toBe("npp");
    // A live world's rows predate the field: undefined reads as full simulation.
    expect(resolveCountryTier("FR", true, undefined)).toBe("npp");
  });
});

describe("country tier snapshot", () => {
  it("resolves the 2027 rows the reset writes", () => {
    const docs = [
      ...["UK", "DE", "JP", "CN"].map((id) => row(id, { status: "beta" })),
      ...["IE", "BR", "NG", "RU", "PL", "HU", "RO", "BG"].map((id) =>
        row(id, { status: "beta", backgroundCountry: true })
      ),
      ...["FR", "IT", "ES", "SE", "TR", "AT", "FI", "GR"].map((id) =>
        row(id, { status: "beta", backgroundCountry: true })
      ),
      row("DD", { absentInEra: true }),
      row("CS", { absentInEra: true }),
      row("YU", { absentInEra: true }),
    ];
    const tiers = buildCountryTierSnapshot(docs);
    expect(tiers.tierOf("US")).toBe("player");
    expect(tiers.tierOf("UK")).toBe("npp");
    expect(tiers.tierOf("FR")).toBe("background");
    expect(tiers.tierOf("DD")).toBe("absent");
    expect(tiers.backgroundIds).toHaveLength(16);
    expect(tiers.fullSimulationIds).not.toContain("FR");
    expect(tiers.fullSimulationIds).toEqual(expect.arrayContaining(["US", "UK", "DE", "JP", "CN"]));
    // Background countries stay registered: pages, currency and exchange rate.
    expect(tiers.registeredIds).toContain("FR");
  });

  it("leaves a world without background rows exactly as the registry has it", () => {
    const tiers = buildCountryTierSnapshot([row("UK", { enabledForPlayers: true })]);
    expect(tiers.backgroundIds).toEqual([]);
    const seededBefore = COUNTRY_ORDER.filter((id) => id !== "CA");
    expect(tiers.fullSimulationIds).toEqual(seededBefore);
    expect(tiers.registeredIds).toEqual(seededBefore);
  });

  it("keeps a country that joined the roster later out of a world seeded before it", () => {
    // A live world's rows: every country it seeded, none for Canada.
    const live = buildCountryTierSnapshot(
      COUNTRY_ORDER.filter((id) => id !== "US" && id !== "CA").map((id) =>
        row(id, { status: "beta" })
      )
    );
    expect(live.tierOf("CA")).toBe("absent");
    expect(live.registeredIds).not.toContain("CA");
    expect(live.fullSimulationIds).not.toContain("CA");

    const fresh = buildCountryTierSnapshot([
      row("CA", { status: "active", enabledForPlayers: true }),
    ]);
    expect(fresh.tierOf("CA")).toBe("player");
  });

  it("loads a seeded late-joiner row whatever its status", async () => {
    const memory = createInMemoryDb();
    memory.seed("countryGameStates", [{ _id: "CA", status: "beta", enabledForPlayers: false }]);
    const db = memory as unknown as Db;
    expect(await getCountryTier(db, "CA")).toBe("npp");
    expect(await getRegisteredCountryIds(db)).toContain("CA");
    const preCanada = createInMemoryDb();
    preCanada.seed("countryGameStates", [{ _id: "UK", status: "beta" }]);
    expect(await getRegisteredCountryIds(preCanada as unknown as Db)).not.toContain("CA");
    // A world mid-reset holds no rows yet and keeps the full registered list.
    expect(await getRegisteredCountryIds(createInMemoryDb() as unknown as Db)).toContain("CA");
  });

  it("loads from countryGameStates in one read", async () => {
    const memory = createInMemoryDb();
    memory.seed("countryGameStates", [
      { _id: "FR", status: "beta", backgroundCountry: true },
      { _id: "UK", status: "beta", enabledForPlayers: true },
      { _id: "DD", absentInEra: true },
    ]);
    const db = memory as unknown as Db;
    const tiers = await loadCountryTiers(db);
    expect(tiers.tierOf("FR")).toBe("background");
    expect(tiers.tierOf("UK")).toBe("player");
    expect(tiers.tierOf("DD")).toBe("absent");
    expect(await getCountryTier(db, "IT")).toBe("npp");
  });
});
