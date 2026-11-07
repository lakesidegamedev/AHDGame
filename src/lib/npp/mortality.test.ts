import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import {
  annualDeathProbability,
  annualRetirementProbability,
  backfillBirthYear,
  nppAgeAtYear,
  nppRetiresThisTurn,
  processNppMortality,
  randomReplacementBirthYear,
} from "@/lib/npp/mortality";
import type { NPP } from "@/lib/db/types/npp";
import { nppAutonomyAtLeast } from "@/lib/nppAutonomy/featureFlag";
import { DEFAULT_GAME_STATE_FLAGS } from "@/lib/seeds/reference/featureFlagDefaults";

vi.mock("@/lib/nppAutonomy/featureFlag", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/nppAutonomy/featureFlag")>();
  return { ...mod, nppAutonomyAtLeast: vi.fn() };
});

function npp(over: Partial<NPP> = {}): NPP {
  return {
    _id: new ObjectId(),
    name: "Test NPP",
    countryId: "US",
    homeState: "CA",
    party: "1",
    currentOffice: { type: "house", state: "CA", seatsHeld: 1 },
    birthYear: 1950,
    gender: "male",
    ethnicity: "white",
    politicalInfluence: 10,
    favorability: 50,
    policies: { economic: 0, social: 0 },
    personality: { loyalty: 50, ambition: 50, stubbornness: 40 },
    generatedAt: new Date(),
    retiredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as NPP;
}

describe("nppAgeAtYear", () => {
  it("computes whole game years from birth year", () => {
    expect(nppAgeAtYear({ birthYear: 1930 }, 1991)).toBe(61);
    expect(nppAgeAtYear({ birthYear: 1947 }, 2019)).toBe(72);
  });

  it("returns null when no birth year is on record", () => {
    expect(nppAgeAtYear({}, 2019)).toBeNull();
    expect(nppAgeAtYear({ birthYear: null }, 2019)).toBeNull();
  });
});

describe("annualDeathProbability", () => {
  it("rises monotonically with age at actuarial orders of magnitude", () => {
    const p30 = annualDeathProbability(30);
    const p50 = annualDeathProbability(50);
    const p65 = annualDeathProbability(65);
    const p85 = annualDeathProbability(85);
    expect(p30).toBeGreaterThan(0);
    expect(p30).toBeLessThan(p50);
    expect(p50).toBeLessThan(p65);
    expect(p65).toBeLessThan(p85);
    expect(p30).toBeLessThan(0.005);
    expect(p65).toBeGreaterThan(0.005);
  });

  it("caps at 50% and rejects nonsense", () => {
    expect(annualDeathProbability(150)).toBe(0.5);
    expect(annualDeathProbability(-5)).toBe(0);
  });
});

describe("randomReplacementBirthYear", () => {
  it("mints a working-age adult (32-68)", () => {
    for (let i = 0; i < 200; i++) {
      const y = randomReplacementBirthYear(2019, Math.random);
      expect(2019 - y).toBeGreaterThanOrEqual(32);
      expect(2019 - y).toBeLessThanOrEqual(68);
    }
  });
});

describe("annualRetirementProbability", () => {
  it("is zero before 70, climbs to 35% at 80 and holds", () => {
    expect(annualRetirementProbability(69)).toBe(0);
    expect(annualRetirementProbability(70)).toBeCloseTo(0.05);
    expect(annualRetirementProbability(75)).toBeCloseTo(0.2);
    expect(annualRetirementProbability(80)).toBeCloseTo(0.35);
    expect(annualRetirementProbability(95)).toBeCloseTo(0.35);
    expect(annualRetirementProbability(Number.NaN)).toBe(0);
  });

  it("rolls per turn at the annual rate divided by turns per year", () => {
    expect(nppRetiresThisTurn(80, () => 0.35 / 48 - 1e-9, 48)).toBe(true);
    expect(nppRetiresThisTurn(80, () => 0.35 / 48 + 1e-9, 48)).toBe(false);
    expect(nppRetiresThisTurn(60, () => 0, 48)).toBe(false);
    expect(nppRetiresThisTurn(80, () => 0, 0)).toBe(false);
  });
});

describe("backfillBirthYear", () => {
  it("is deterministic per id and lands on ages 35-70", () => {
    const ages = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const id = new ObjectId().toHexString();
      const y = backfillBirthYear(id, 2027);
      expect(backfillBirthYear(id, 2027)).toBe(y);
      expect(2027 - y).toBeGreaterThanOrEqual(35);
      expect(2027 - y).toBeLessThanOrEqual(70);
      ages.add(2027 - y);
    }
    expect(ages.size).toBeGreaterThan(20);
  });
});

describe("processNppMortality", () => {
  let db: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
  });

  function seedNpps(docs: NPP[]) {
    db.collection("npps");
    db.collectionMocks["npps"].find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(docs),
      }),
    });
  }

  function mintStub(dead: NPP) {
    return Promise.resolve(
      npp({
        _id: new ObjectId(),
        name: "Replacement Person",
        birthYear: 1975,
        currentOffice: dead.currentOffice,
      })
    );
  }

  it("retires the dead NPP, inserts an aged successor, and repoints the office", async () => {
    vi.mocked(nppAutonomyAtLeast).mockResolvedValue(true);
    const dead = npp({ birthYear: 1900 });
    db.collection("electedOfficials");
    seedNpps([dead]);

    const result = await processNppMortality(db as unknown as Db, {
      now: new Date("2019-01-01T00:00:00Z"),
      year: 2019,
      rng: () => 0, // certain death
      mintReplacement: mintStub,
    });

    expect(result).toMatchObject({ deaths: 1, retirements: 0, replacements: 1 });
    const npps = db.collectionMocks["npps"];
    expect(npps.insertOne).toHaveBeenCalledTimes(1);
    expect(npps.updateOne).toHaveBeenCalledWith(
      { _id: dead._id },
      expect.objectContaining({ $set: expect.objectContaining({ currentOffice: null }) })
    );
    const retiredSet = npps.updateOne.mock.calls[0][1].$set;
    expect(retiredSet.retiredAt).toBeInstanceOf(Date);
    const officials = db.collectionMocks["electedOfficials"];
    expect(officials.updateMany).toHaveBeenCalledWith(
      { nppId: dead._id },
      expect.objectContaining({
        $set: expect.objectContaining({ characterName: "Replacement Person" }),
      })
    );
    const inserted = npps.insertOne.mock.calls[0][0];
    expect(inserted.birthYear).toBe(1975);
  });

  it("vacates the CEO seat of companies the dead NPP ran", async () => {
    vi.mocked(nppAutonomyAtLeast).mockResolvedValue(true);
    const dead = npp({ birthYear: 1900 });
    db.collection("corporations");
    seedNpps([dead]);

    await processNppMortality(db as unknown as Db, {
      now: new Date("2019-01-01T00:00:00Z"),
      year: 2019,
      rng: () => 0,
      mintReplacement: mintStub,
    });

    expect(db.collectionMocks["corporations"].updateMany).toHaveBeenCalledWith(
      { ceoId: { $in: [dead._id] }, caretakerCeo: { $exists: false }, ceoVacant: { $ne: true } },
      expect.objectContaining({ $set: expect.objectContaining({ ceoVacant: true }) })
    );
  });

  it("repoints head-of-government formation ids to the successor", async () => {
    vi.mocked(nppAutonomyAtLeast).mockResolvedValue(true);
    const dead = npp({ birthYear: 1900 });
    db.collection("governmentFormations");
    seedNpps([dead]);

    await processNppMortality(db as unknown as Db, {
      now: new Date("2019-01-01T00:00:00Z"),
      year: 2019,
      rng: () => 0,
      mintReplacement: mintStub,
    });

    const formations = db.collectionMocks["governmentFormations"];
    expect(formations.updateMany).toHaveBeenCalledTimes(3);
    for (const [field, nameField] of [
      ["pmNppId", "pmName"],
      ["presidentNppId", "presidentName"],
      ["hosNppId", "hosName"],
    ]) {
      expect(formations.updateMany).toHaveBeenCalledWith(
        { [field]: dead._id },
        expect.objectContaining({
          $set: expect.objectContaining({
            [field]: expect.any(ObjectId),
            [nameField]: "Replacement Person",
          }),
        })
      );
    }
  });

  it("hands cabinet posts, national leadership and player-company caretaking to the successor", async () => {
    vi.mocked(nppAutonomyAtLeast).mockResolvedValue(true);
    const dead = npp({ birthYear: 1900 });
    const caretakenCorpId = new ObjectId();
    db.collection("cabinetMembers");
    db.collection("countryLeaderStates");
    db.collection("corporations");
    db.collectionMocks["corporations"].find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: caretakenCorpId, ceoId: dead._id }]),
    });
    seedNpps([dead]);

    await processNppMortality(db as unknown as Db, {
      now: new Date("2019-01-01T00:00:00Z"),
      year: 2019,
      rng: () => 0,
      mintReplacement: mintStub,
    });

    expect(db.collectionMocks["cabinetMembers"].bulkWrite).toHaveBeenCalledWith(
      [
        {
          updateMany: {
            filter: { nppId: dead._id },
            update: {
              $set: expect.objectContaining({
                nppId: expect.any(ObjectId),
                characterName: "Replacement Person",
              }),
            },
          },
        },
      ],
      { ordered: false }
    );
    expect(db.collectionMocks["countryLeaderStates"].bulkWrite).toHaveBeenCalledWith(
      [
        {
          updateMany: {
            filter: { leaderNppId: dead._id },
            update: { $set: { leaderNppId: expect.any(ObjectId) } },
          },
        },
      ],
      { ordered: false }
    );
    expect(db.collectionMocks["corporations"].bulkWrite).toHaveBeenCalledWith(
      [
        {
          updateOne: {
            filter: { _id: caretakenCorpId },
            update: { $set: expect.objectContaining({ ceoId: expect.any(ObjectId) }) },
          },
        },
      ],
      { ordered: false }
    );
  });

  it("withdraws active election candidacies for the dead NPP", async () => {
    vi.mocked(nppAutonomyAtLeast).mockResolvedValue(true);
    const dead = npp({ birthYear: 1900 });
    seedNpps([dead]);

    await processNppMortality(db as unknown as Db, {
      now: new Date("2019-01-01T00:00:00Z"),
      year: 2019,
      rng: () => 0,
      mintReplacement: mintStub,
    });

    expect(db.collectionMocks["electionCandidates"]!.updateMany).toHaveBeenCalledWith(
      { nppId: dead._id, status: "active" },
      { $set: { status: "withdrawn", withdrawnAt: expect.any(Date) } }
    );
  });

  it.each(["BG", "HU"] as const)(
    "preserves%s native slate owners without rolling or minting",
    async (countryId) => {
      vi.mocked(nppAutonomyAtLeast).mockResolvedValue(true);
      const owner = npp({ countryId, birthYear: 1900 });
      seedNpps([owner]);
      db.collection("electedOfficials");
      db.collectionMocks["electedOfficials"].distinct.mockResolvedValue([owner._id]);
      const rng = vi.fn(() => 0),
        mint = vi.fn(mintStub);
      expect(
        await processNppMortality(db as unknown as Db, {
          now: new Date("1991-01-01"),
          year: 1991,
          rng,
          mintReplacement: mint,
        })
      ).toMatchObject({ deaths: 0, retirements: 0, replacements: 0 });
      expect(rng).not.toHaveBeenCalled();
      expect(mint).not.toHaveBeenCalled();
      expect(db.collectionMocks["npps"].insertOne).not.toHaveBeenCalled();
      expect(db.collectionMocks["npps"].updateOne).not.toHaveBeenCalled();
      expect(db.collectionMocks["electedOfficials"].updateMany).not.toHaveBeenCalled();
      expect(db.collectionMocks["electedOfficials"].distinct).toHaveBeenCalledTimes(1);
      expect(db.collectionMocks["electedOfficials"].distinct).toHaveBeenCalledWith(
        "nppId",
        expect.objectContaining({ seatsHeld: 1 })
      );
    }
  );
  it("retains ordinary Bulgarian mortality for unmarked offices", async () => {
    vi.mocked(nppAutonomyAtLeast).mockResolvedValue(true);
    seedNpps([npp({ countryId: "BG", birthYear: 1900 })]);
    expect(
      await processNppMortality(db as unknown as Db, {
        now: new Date("1991-01-01"),
        year: 1991,
        rng: () => 0,
        mintReplacement: mintStub,
      })
    ).toMatchObject({ deaths: 1, retirements: 0, replacements: 1 });
  });
  it("leaves the young alive", async () => {
    vi.mocked(nppAutonomyAtLeast).mockResolvedValue(true);
    seedNpps([npp({ birthYear: 1980 })]);

    const result = await processNppMortality(db as unknown as Db, {
      now: new Date("2019-01-01T00:00:00Z"),
      year: 2019,
      rng: () => 0.9999999, // certain survival
      mintReplacement: mintStub,
    });

    expect(result).toMatchObject({ deaths: 0, retirements: 0, replacements: 0 });
    expect(db.collectionMocks["npps"].insertOne).not.toHaveBeenCalled();
  });

  it("skips non-V5 countries, birth-year-less NPPs, and technocrats without rolling", async () => {
    const gate = vi.mocked(nppAutonomyAtLeast);
    gate.mockImplementation(async (_db, countryId) => countryId === "US");
    const rng = vi.fn(() => 0); // would kill anything rolled
    seedNpps([
      npp({ birthYear: 1900, countryId: "UK" }),
      npp({ birthYear: null }),
      npp({ birthYear: 1900, isTechnocrat: true }),
      npp({ birthYear: 1900, currentOffice: null }),
    ]);

    // Technocrats and unseated NPPs are filtered in the query; the other two
    // reach the eligibility guard without rolling.
    const result = await processNppMortality(db as unknown as Db, {
      now: new Date("2019-01-01T00:00:00Z"),
      year: 2019,
      rng,
      mintReplacement: mintStub,
    });

    expect(result).toMatchObject({ deaths: 0, retirements: 0, replacements: 0 });
    expect(rng).not.toHaveBeenCalled();
  });

  describe("nppTurnoverEnabled", () => {
    function setTurnover(value: boolean | undefined) {
      db.collection("gameState");
      db.collectionMocks["gameState"].findOne.mockResolvedValue(
        value === undefined ? {} : { nppTurnoverEnabled: value }
      );
    }

    function seedWithBackfill(missing: Array<{ _id: ObjectId }>, docs: NPP[]) {
      db.collection("npps");
      db.collectionMocks["npps"].find
        .mockReturnValueOnce({
          limit: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(missing) }),
        })
        .mockReturnValue({
          project: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(docs) }),
        });
    }

    it("is on for fresh worlds", () => {
      expect(DEFAULT_GAME_STATE_FLAGS.nppTurnoverEnabled).toBe(true);
    });

    it("turns NPPs over below V5 when the flag is on", async () => {
      setTurnover(true);
      vi.mocked(nppAutonomyAtLeast).mockResolvedValue(false);
      seedWithBackfill([], [npp({ countryId: "UK", birthYear: 1900 })]);

      const result = await processNppMortality(db as unknown as Db, {
        now: new Date("2027-01-01T00:00:00Z"),
        year: 2027,
        rng: () => 0,
        mintReplacement: mintStub,
      });

      expect(result).toMatchObject({ deaths: 1, replacements: 1 });
      expect(nppAutonomyAtLeast).not.toHaveBeenCalled();
    });

    it("retires an old survivor and seats a successor like a death", async () => {
      setTurnover(true);
      const old = npp({ birthYear: 1947 }); // 80 in 2027
      seedWithBackfill([], [old]);
      const rolls = [0.99, 0]; // survive the death roll, then retire
      const mint = vi.fn(mintStub);

      const result = await processNppMortality(db as unknown as Db, {
        now: new Date("2027-01-01T00:00:00Z"),
        year: 2027,
        rng: () => rolls.shift() ?? 0.99,
        mintReplacement: mint,
      });

      expect(result).toMatchObject({ deaths: 0, retirements: 1, replacements: 1 });
      expect(mint).toHaveBeenCalledTimes(1);
      expect(db.collectionMocks["npps"].updateOne).toHaveBeenCalledWith(
        { _id: old._id },
        {
          $set: expect.objectContaining({ retiredAt: expect.any(Date), currentOffice: null }),
        }
      );
      expect(db.collectionMocks["electedOfficials"]!.updateMany).toHaveBeenCalledWith(
        { nppId: old._id },
        expect.anything()
      );
    });

    it("backfills missing birth years for seated NPPs", async () => {
      setTurnover(true);
      const missing = [{ _id: new ObjectId() }, { _id: new ObjectId() }];
      seedWithBackfill(missing, []);

      const result = await processNppMortality(db as unknown as Db, {
        now: new Date("2027-01-01T00:00:00Z"),
        year: 2027,
        rng: () => 0.99,
        mintReplacement: mintStub,
      });

      expect(result.birthYearsAssigned).toBe(2);
      const [ops] = db.collectionMocks["npps"].bulkWrite.mock.calls[0];
      expect(ops).toHaveLength(2);
      expect(ops[0].updateOne.filter).toEqual({ _id: missing[0]._id, birthYear: null });
      expect(ops[0].updateOne.update.$set.birthYear).toBe(
        backfillBirthYear(missing[0]._id.toHexString(), 2027)
      );
    });

    it("keeps the V5 gate, no retirement and no backfill when the flag is absent", async () => {
      setTurnover(undefined);
      vi.mocked(nppAutonomyAtLeast).mockImplementation(
        async (_db, countryId) => countryId === "US"
      );
      const rng = vi.fn().mockReturnValueOnce(0.99).mockReturnValue(0);
      seedNpps([npp({ birthYear: 1947 }), npp({ countryId: "UK", birthYear: 1900 })]);

      const result = await processNppMortality(db as unknown as Db, {
        now: new Date("2027-01-01T00:00:00Z"),
        year: 2027,
        rng,
        mintReplacement: mintStub,
      });

      // The US 80-year-old survives the only roll it gets; the UK NPP is gated.
      expect(result).toEqual({ deaths: 0, retirements: 0, replacements: 0, birthYearsAssigned: 0 });
      expect(rng).toHaveBeenCalledTimes(1);
      expect(db.collectionMocks["npps"].bulkWrite).not.toHaveBeenCalled();
    });

    it("does nothing when the flag is off", async () => {
      setTurnover(false);
      vi.mocked(nppAutonomyAtLeast).mockResolvedValue(true);
      seedNpps([npp({ birthYear: 1900 })]);

      const result = await processNppMortality(db as unknown as Db, {
        now: new Date("2027-01-01T00:00:00Z"),
        year: 2027,
        rng: () => 0,
        mintReplacement: mintStub,
      });

      expect(result).toEqual({ deaths: 0, retirements: 0, replacements: 0, birthYearsAssigned: 0 });
      expect(db.collectionMocks["npps"].find).not.toHaveBeenCalled();
    });
  });
});
