import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/providerIdentityIndexes", () => ({
  ensureProviderIdentityIndexes: vi.fn().mockResolvedValue([]),
}));

const { ensureIndexMock } = vi.hoisted(() => ({
  ensureIndexMock: vi.fn(),
}));

vi.mock("./helpers", () => ({
  ensureIndex: ensureIndexMock,
}));

import { seedCoreIndexes } from "./core";

describe("seedCoreIndexes", () => {
  beforeEach(() => {
    ensureIndexMock.mockReset();
  });

  it("installs the sector identity unique index and never heals existing sector documents", async () => {
    const db = {
      collection: vi.fn(() => ({
        find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
        createIndex: vi.fn().mockResolvedValue("corporations_sequentialId"),
      })),
    } as unknown as Db;

    await seedCoreIndexes(db, vi.fn());

    const uniqueIndexOrder = ensureIndexMock.mock.calls.find(
      (call) =>
        call[1] === "corporateSectors" &&
        call[3]?.name === "corporateSectors_corporation_state_type_unique"
    );
    expect(uniqueIndexOrder).toBeDefined();
  });
});
