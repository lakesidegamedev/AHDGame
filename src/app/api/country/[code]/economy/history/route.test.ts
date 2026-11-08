import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/economy/queries/countryMacroHistory", () => ({
  buildCountryMacroHistory: mocks.build,
}));

import { GET } from "./route";

const params = (code: string) => ({ params: Promise.resolve({ code }) });
const request = (query = "") =>
  new Request(`http://localhost/api/country/us/economy/history${query}`);

describe("GET /api/country/[code]/economy/history", () => {
  beforeEach(() => {
    mocks.build.mockReset();
    mocks.build.mockResolvedValue({
      countryId: "US",
      currencyCode: "USD",
      currentTurn: 744,
      turns: 120,
      points: [{ turn: 744, year: 1994, gdpMillions: 1, population: 2, gdpPerCapita: 3 }],
    });
  });

  it("returns the national series for a valid country", async () => {
    const response = await GET(request(), params("us"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.currencyCode).toBe("USD");
    expect(body.points).toHaveLength(1);
    expect(mocks.build).toHaveBeenCalledWith({}, "US", 120);
  });

  it("passes a requested window through for clamping", async () => {
    await GET(request("?turns=48"), params("jp"));
    expect(mocks.build).toHaveBeenCalledWith({}, "JP", 48);
  });

  it("falls back to the default window on junk input", async () => {
    await GET(request("?turns=lots"), params("us"));
    expect(mocks.build).toHaveBeenCalledWith({}, "US", 120);
  });

  it("rejects an unknown country code with 400", async () => {
    const response = await GET(request(), params("zz"));
    expect(response.status).toBe(400);
    expect(mocks.build).not.toHaveBeenCalled();
  });
});
