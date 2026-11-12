import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { SeedContractError } from "@/lib/seeds/contract/seedContractError";
import { seedRuStatePartyOrg } from "@/lib/countries/ru/seedRuStatePartyOrg";
import { seedDdStatePartyOrg } from "@/lib/admin/seed/seedDdStatePartyOrg";
import { seedGameConfig } from "@/lib/admin/seed/seedGameConfig";
import { resetGameWorld } from "@/lib/admin/resetGameWorld";
import { runSeed } from "@/lib/admin/seed/runCoreSeed";
import { seedEasternBlocStatePartyOrg } from "@/lib/admin/seed/seedEasternBlocStatePartyOrg";

/** A world with no stored preset: every read comes back empty. */
function emptyWorld(): Db {
  const collection = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi
      .fn()
      .mockReturnValue({ toArray: async () => [], project: () => ({ toArray: async () => [] }) }),
    deleteMany: vi.fn(),
  };
  return { collection: () => collection } as unknown as Db;
}

describe("seeders refuse to guess a preset", () => {
  const log = vi.fn();

  it("RU state party org", async () => {
    await expect(seedRuStatePartyOrg(emptyWorld(), false, log)).rejects.toBeInstanceOf(
      SeedContractError
    );
  });

  it("DD state party org", async () => {
    await expect(seedDdStatePartyOrg(emptyWorld(), false, log)).rejects.toBeInstanceOf(
      SeedContractError
    );
  });

  it("Eastern bloc state party org", async () => {
    await expect(seedEasternBlocStatePartyOrg(emptyWorld(), false, log)).rejects.toBeInstanceOf(
      SeedContractError
    );
  });

  it("game config refuses an unknown preset before dropping anything", async () => {
    const drop = vi.fn();
    const db = { collection: () => ({ drop }) } as unknown as Db;
    await expect(seedGameConfig(db, true, log, "1850-default")).rejects.toBeInstanceOf(
      SeedContractError
    );
    expect(drop).not.toHaveBeenCalled();
  });

  it("world reset refuses a missing or unknown preset before any write", async () => {
    const write = vi.fn();
    const db = { collection: () => ({ deleteMany: write, drop: write, updateOne: write }) };
    await expect(
      resetGameWorld(db as unknown as Db, { deleteProfiles: false, preset: "nope" })
    ).rejects.toBeInstanceOf(SeedContractError);
    await expect(
      resetGameWorld(db as unknown as Db, {
        deleteProfiles: false,
        preset: undefined as unknown as string,
      })
    ).rejects.toBeInstanceOf(SeedContractError);
    expect(write).not.toHaveBeenCalled();
  });

  it("core seed refuses a blank preset before any write", async () => {
    const write = vi.fn();
    const db = { collection: () => ({ countDocuments: write, insertMany: write }) };
    await expect(runSeed({ db: db as unknown as Db, preset: "" })).rejects.toBeInstanceOf(
      SeedContractError
    );
    expect(write).not.toHaveBeenCalled();
  });
});
