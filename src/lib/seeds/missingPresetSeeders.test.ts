import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { SeedContractError } from "@/lib/seeds/contract/seedContractError";
import { seedRuStatePartyOrg } from "@/lib/countries/ru/seedRuStatePartyOrg";
import { seedDdStatePartyOrg } from "@/lib/admin/seed/seedDdStatePartyOrg";
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
});
