import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";

/**
 * `background` lists the countries the tier rows mark as background (#5702).
 * The NPP rollout is off, so the only widening of the roll is theirs.
 */
const stubDb = (background: string[]) =>
  ({
    collection: (name?: string) => ({
      findOne: async () => ({
        _id: "current",
        preset: "2027-default",
        nppForeignPolicyMode: "off",
      }),
      find: () => ({
        toArray: async () =>
          name === "countryGameStates"
            ? [
                { _id: "US", status: "active", enabledForPlayers: true },
                ...background.map((id) => ({ _id: id, status: "beta", backgroundCountry: true })),
              ]
            : [],
      }),
      // The passed sanctions write their embargo rows.
      insertMany: async () => ({ insertedCount: 0 }),
    }),
  }) as unknown as Db;

let roster: string[] = [];

vi.mock("@/lib/db/collections", () => ({
  getOrganizationLeadershipCollection: vi.fn(),
  getOrganizationLeadershipElectionsCollection: vi.fn(),
  getOrganizationLegislationCollection: vi.fn(),
  getOrganizationMembershipsCollection: vi.fn(),
  getOrganizationProposalsCollection: vi.fn(),
  getOrganizationFundsCollection: vi.fn(),
}));
vi.mock("@/lib/internationalOrganizations/service", () => ({
  getMembers: vi.fn(async () => roster),
  loadOrganizationDef: vi.fn(),
  recordOrgHistoryEvent: vi.fn(),
}));
vi.mock("@/lib/nppAutonomy/autonomousOrgVoting", () => ({
  castAutonomousOrgVotes: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/internationalOrganizations/founding", () => ({
  loadOrgFoundingContext: vi.fn().mockResolvedValue({ liveYear: null, preset: "1953-default" }),
}));
vi.mock("@/lib/countryAccess", () => ({ getAllCountryAccess: vi.fn() }));
vi.mock("@/lib/internationalOrganizations/organizationFund", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/internationalOrganizations/organizationFund")>()),
  chargeOrganizationDues: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/internationalOrganizations/queries/worldOrganizations", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/internationalOrganizations/queries/worldOrganizations")
  >()),
  loadUsdGdpByCountry: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/internationalOrganizations/tribute", () => ({
  chargeOrganizationTribute: vi.fn().mockResolvedValue({ collectedLocal: 0, payers: 0, minted: 0 }),
}));
vi.mock("@/lib/internationalOrganizations/joinApplication", () => ({
  admitMember: vi.fn(),
  resolveJoinApplication: vi.fn(),
}));
vi.mock("@/lib/db/collections/conflicts", () => ({ getConflict: vi.fn(async () => null) }));
// The script itself has its own suite; this one is about the roll it is seated on.
vi.mock("@/lib/internationalOrganizations/backgroundOrgVoting", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/internationalOrganizations/backgroundOrgVoting")
  >()),
  castBackgroundOrgVotes: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/internationalOrganizations/europeanIntegration/service", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/internationalOrganizations/europeanIntegration/service")
  >()),
  reconcileEuropeanTreatyLive: vi.fn().mockResolvedValue(false),
}));

const { processInternationalOrganizationsTurn } =
  await import("../internationalOrganizationsPhase");

/** Only the US is open to players. */
function playersOnly(...players: string[]) {
  return new Proxy({} as Record<string, { enabledForPlayers: boolean }>, {
    get: (_t, key) =>
      typeof key === "string" && players.includes(key) ? { enabledForPlayers: true } : undefined,
  });
}

const SANCTIONS_ID = new ObjectId("507f1f77bcf86cd7994390d1");

async function runSanctions(
  votes: { countryId: string; vote: "yes" | "no" | "abstain" }[],
  db: Db
) {
  const collections = await import("@/lib/db/collections");
  const empty = () => ({
    find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    updateOne: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
  });
  vi.mocked(collections.getOrganizationProposalsCollection).mockResolvedValue(empty() as never);
  vi.mocked(collections.getOrganizationMembershipsCollection).mockResolvedValue(empty() as never);
  vi.mocked(collections.getOrganizationLeadershipElectionsCollection).mockResolvedValue(
    empty() as never
  );
  vi.mocked(collections.getOrganizationLeadershipCollection).mockResolvedValue({
    updateOne: vi.fn(),
  } as never);

  const legislationUpdate = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  vi.mocked(collections.getOrganizationLegislationCollection).mockResolvedValue({
    find: vi
      .fn()
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: SANCTIONS_ID,
            organizationId: "NATO",
            type: "sanctions",
            parties: [],
            sanctionsTargetCountryId: "RU",
            sanctionsCommodity: "all",
            proposingCountryId: "US",
            status: "pending",
            closesOnTurn: 10,
            votes,
          },
        ]),
      })
      .mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    updateOne: legislationUpdate,
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
  } as never);

  await processInternationalOrganizationsTurn(db, 10);
  return legislationUpdate.mock.calls[0]?.[1]?.$set?.status as string | undefined;
}

describe("background members on the organisation roll (#5702)", () => {
  beforeEach(async () => {
    roster = ["US", "FR", "PL"];
    const access = await import("@/lib/countryAccess");
    vi.mocked(access.getAllCountryAccess).mockResolvedValue(playersOnly("US") as never);
  });

  it("counts their votes: two background noes outvote the one player yes", async () => {
    const status = await runSanctions(
      [
        { countryId: "US", vote: "yes" },
        { countryId: "FR", vote: "no" },
        { countryId: "PL", vote: "no" },
      ],
      stubDb(["FR", "PL"])
    );
    expect(status).toBe("rejected");
  });

  it("leaves the roll to the players in a world without background countries", async () => {
    const status = await runSanctions(
      [
        { countryId: "US", vote: "yes" },
        { countryId: "FR", vote: "no" },
        { countryId: "PL", vote: "no" },
      ],
      stubDb([])
    );
    expect(status).toBe("active");
  });
});
