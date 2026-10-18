import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/extraction/computeContractedShare", () => ({ computeContractedShare: vi.fn() }));
vi.mock("@/lib/extraction/contractAuthority", () => ({
  getResourceContractAuthority: vi.fn().mockResolvedValue("national"),
}));
import { computeContractedShare } from "@/lib/extraction/computeContractedShare";
import { GET } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(computeContractedShare).mockResolvedValue(0.5);
});
describe("country-scoped extraction headroom", () => {
  it("uses one country-scoped snapshot for usage and remaining capacity", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/contracts/extraction/headroom?countryId=DE&stateId=HB&resource=oil"
      )
    );
    expect(await response.json()).toMatchObject({ contractedShare: 0.5, remainingHeadroom: 0.25 });
    expect(computeContractedShare).toHaveBeenCalledExactlyOnceWith({}, "HB", "oil", "DE");
  });
  it("never returns negative headroom for an administrative over-allocation", async () => {
    vi.mocked(computeContractedShare).mockResolvedValue(0.9);
    const response = await GET(
      new Request(
        "http://localhost/api/contracts/extraction/headroom?countryId=DE&stateId=HB&resource=oil"
      )
    );
    expect(await response.json()).toMatchObject({ contractedShare: 0.9, remainingHeadroom: 0 });
  });
});
