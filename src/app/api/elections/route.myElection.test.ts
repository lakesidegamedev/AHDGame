import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { getDb } from "@/lib/mongodb";
import { findBlockingActiveCandidacy } from "@/lib/elections/activeCandidacy";
import { GET } from "./route";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "507f1f77bcf86cd799439011" })),
}));
vi.mock("@/lib/elections/activeCandidacy", () => ({ findBlockingActiveCandidacy: vi.fn() }));
vi.mock("@/lib/observability/apiMetrics", () => ({
  withApiMetrics: (_name: string, fn: unknown) => fn,
}));

beforeEach(() => {
  const memory = createInMemoryDb();
  memory.seed("characters", [
    { _id: new ObjectId(), userId: new ObjectId("507f1f77bcf86cd799439011") },
  ]);
  vi.mocked(getDb).mockResolvedValue(memory as unknown as Db);
});

it.each([
  ["CA", "CA_NT", "NT"],
  ["US", "CA", "CA"],
])(
  "serves short %s election labels without changing the seat identity",
  async (countryId, state, short) => {
    const election = {
      _id: new ObjectId(),
      countryId,
      state,
      electionType: "governor",
      seatId: `${countryId}-governor-${state}`,
    };
    vi.mocked(findBlockingActiveCandidacy).mockResolvedValue({ election } as never);
    const response = await GET(new Request("http://localhost/api/elections?myElection=1"));
    expect(response.status).toBe(200);
    const { myElection } = await response.json();
    expect(myElection.label).toContain(` · ${short}`);
    expect(myElection.label).not.toContain("CA_");
    expect(myElection.seatId).toBe(election.seatId);
  }
);
