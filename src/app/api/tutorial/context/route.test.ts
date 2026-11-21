import { describe, expect, it, vi } from "vitest";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { getDb } from "@/lib/mongodb";
import { GET } from "./route";

vi.mock("@/lib/api/requireAuth", () => ({ requireAuthWithCharacter: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

describe("tutorial campaign funds", () => {
  it.each([
    [{ personal: {}, campaign: 1_200_000 }, "$1,200,000.00 · 20 actions"],
    [undefined, "₳300,000 · 20 actions"],
  ])("shows the campaign wallet in its stored currency", async (currencyBalances, expected) => {
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: {
        character: {
          countryId: "US",
          homeState: "OH",
          funds: 300_000,
          currencyBalances,
          actions: 20,
        },
      },
    } as Awaited<ReturnType<typeof requireAuthWithCharacter>>);
    vi.mocked(getDb).mockResolvedValue({
      collection: () => ({
        findOne: async () => null,
        countDocuments: async () => 0,
      }),
    } as unknown as Awaited<ReturnType<typeof getDb>>);

    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).wallet).toEqual({
      label: "Campaign funds and actions",
      value: expected,
    });
  });
});
