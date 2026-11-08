/**
 * Schedule parity for the Ireland and Nigeria chamber spawners.
 *
 * Every spawner runs against an in-memory database for each era preset and each
 * scenario below, and the elections it would insert are written to a snapshot.
 * The snapshots were captured from the hand-written spawners before they moved
 * onto chamber specs, so a diff here means an election changed its date, seat
 * count, cycle or region.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Db } from "mongodb";
import { CANONICAL_REAL_ELECTION_YEARS_BY_PRESET } from "@/lib/elections/cycleAnchorContext";
import { IE_DAIL_SEATS_PER_REGION } from "@/lib/seeds/ie/ieRegions";
import { NG_SEATS_PER_REGION } from "@/lib/seeds/ng/ngRegions";
import { IE_LOCAL_COUNCIL_SEATS } from "@/lib/countries/ie/data/ieLocalCouncilSeats";

type Doc = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  states: [] as Doc[],
  elections: [] as Doc[],
  gameState: null as Doc | null,
  inserted: [] as Doc[],
  accessStatus: "active",
}));

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/discordWebhooks", () => ({
  sendCountryGameEventMultiple: vi.fn().mockResolvedValue(undefined),
  DISCORD_COLORS: {},
}));
vi.mock("@/lib/countryAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/countryAccess")>()),
  getCountryAccessFromDb: vi.fn(async () => ({
    status: dbState.accessStatus,
    nppGoverned: false,
  })),
}));

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, want]) => {
    if (key === "$or") return (want as Doc[]).some((f) => matches(doc, f));
    const have = doc[key];
    if (want && typeof want === "object" && "$in" in (want as Doc)) {
      return ((want as { $in: unknown[] }).$in as unknown[]).includes(have);
    }
    return have === want;
  });
}

function cursor(initial: Doc[]) {
  let rows = [...initial];
  const c = {
    sort(spec: Record<string, 1 | -1>) {
      const [[key, dir]] = Object.entries(spec) as [[string, 1 | -1]];
      rows.sort((a, b) => {
        const av = new Date(a[key] as Date).getTime();
        const bv = new Date(b[key] as Date).getTime();
        return (av - bv) * dir;
      });
      return c;
    },
    limit(n: number) {
      rows = rows.slice(0, n);
      return c;
    },
    toArray: async () => rows,
    next: async () => rows[0] ?? null,
  };
  return c;
}

function fakeDb(): Db {
  const collection = (name: string) => {
    const rowsFor = (filter: Doc = {}) => {
      if (name === "states") return dbState.states.filter((d) => matches(d, filter));
      if (name === "elections") return dbState.elections.filter((d) => matches(d, filter));
      return [];
    };
    return {
      find: (filter: Doc = {}) => cursor(rowsFor(filter)),
      findOne: async (filter: Doc = {}) => {
        if (name === "gameState") return dbState.gameState;
        return rowsFor(filter)[0] ?? null;
      },
      insertOne: async (doc: Doc) => {
        dbState.inserted.push(doc);
        return {};
      },
      insertMany: async (docs: Doc[]) => {
        dbState.inserted.push(...docs);
        return {};
      },
    };
  };
  return { collection } as unknown as Db;
}

const NOW = new Date("2026-11-08T12:00:00Z");
const OLD = new Date("2020-01-01T00:00:00Z");

const ERAS = Object.keys(CANONICAL_REAL_ELECTION_YEARS_BY_PRESET);

interface Spawner {
  name: string;
  countryId: "IE" | "NG";
  electionType: string;
  national: boolean;
  run: (now: Date, turn: number) => Promise<void>;
}

async function loadSpawners(): Promise<Spawner[]> {
  const ie = await import("@/lib/countries/ie/elections/perpetual");
  const ng = await import("@/lib/countries/ng/elections/perpetual");
  return [
    {
      name: "ie.dail",
      countryId: "IE",
      electionType: "dail",
      national: false,
      run: ie.ensureIEElections,
    },
    {
      name: "ie.uachtaran",
      countryId: "IE",
      electionType: "uachtaran",
      national: true,
      run: ie.ensureIEUachtaranElections,
    },
    {
      name: "ie.localCouncil",
      countryId: "IE",
      electionType: "localCouncil",
      national: false,
      run: ie.ensureIELocalCouncilElections,
    },
    {
      name: "ng.house",
      countryId: "NG",
      electionType: "house",
      national: false,
      run: ng.ensureNGElections,
    },
    {
      name: "ng.senate",
      countryId: "NG",
      electionType: "senate",
      national: false,
      run: ng.ensureNGSenateElections,
    },
    {
      name: "ng.governor",
      countryId: "NG",
      electionType: "governor",
      national: false,
      run: ng.ensureNGGovernorElections,
    },
    {
      name: "ng.regionalCouncil",
      countryId: "NG",
      electionType: "regionalCouncil",
      national: false,
      run: ng.ensureNGRegionalCouncilElections,
    },
    {
      name: "ng.president",
      countryId: "NG",
      electionType: "president",
      national: true,
      run: ng.ensureNGPresidentialElection,
    },
  ];
}

function regionsFor(countryId: "IE" | "NG"): Doc[] {
  if (countryId === "NG") {
    return Object.entries(NG_SEATS_PER_REGION).map(([id, seats], i) => ({
      _id: id,
      countryId,
      houseDistricts: seats,
      stateSenateSeats: 18 + (i % 4),
    }));
  }
  const dail = Object.entries(IE_DAIL_SEATS_PER_REGION).map(([id, seats]) => ({
    _id: id,
    countryId,
    houseDistricts: seats,
  }));
  const extra = Object.keys(IE_LOCAL_COUNCIL_SEATS)
    .filter((id) => !(id in IE_DAIL_SEATS_PER_REGION))
    .map((id) => ({ _id: id, countryId }));
  return [...dail, ...extra];
}

interface Scenario {
  name: string;
  turn: number;
  gate?: string;
  seed: (s: Spawner, regions: Doc[]) => Doc[];
}

function completed(s: Spawner, state: string, over: Doc = {}): Doc {
  return {
    countryId: s.countryId,
    electionType: s.electionType,
    state,
    status: "completed",
    cycle: 1,
    endTurn: 90,
    totalSeats: 3,
    updatedAt: OLD,
    ...over,
  };
}

function live(s: Spawner, state: string): Doc {
  return {
    countryId: s.countryId,
    electionType: s.electionType,
    state,
    status: "active",
    cycle: 2,
    totalSeats: 2,
    startTime: new Date("2026-10-01T00:00:00Z"),
    primaryEndTime: new Date("2026-12-01T00:00:00Z"),
    endTime: new Date("2027-01-01T00:00:00Z"),
    startTurn: 400,
    primaryEndTurn: 430,
    endTurn: 460,
    durationHours: 60,
    primaryDurationHours: 30,
  };
}

const stateIds = (s: Spawner, regions: Doc[]): string[] =>
  s.national ? [s.countryId] : regions.map((r) => r._id as string);

const SCENARIOS: Scenario[] = [
  { name: "fresh-t1", turn: 1, seed: () => [] },
  { name: "fresh-t300", turn: 300, seed: () => [] },
  {
    name: "after-cycle1-t120",
    turn: 120,
    seed: (s, r) => stateIds(s, r).map((id) => completed(s, id)),
  },
  {
    name: "after-cycle1-t700",
    turn: 700,
    seed: (s, r) => stateIds(s, r).map((id) => completed(s, id, { cycle: 3, endTurn: 600 })),
  },
  {
    name: "all-live",
    turn: 450,
    seed: (s, r) => stateIds(s, r).map((id) => live(s, id)),
  },
  {
    name: "late-joiner",
    turn: 450,
    seed: (s, r) => {
      const ids = stateIds(s, r);
      return ids.slice(0, -1).map((id) => live(s, id));
    },
  },
  {
    name: "late-joiner-with-history",
    turn: 450,
    seed: (s, r) => {
      const ids = stateIds(s, r);
      return [
        ...ids.slice(0, -1).map((id) => live(s, id)),
        completed(s, ids[ids.length - 1]!, { cycle: 1, endTurn: 200 }),
      ];
    },
  },
  {
    name: "resolved-this-turn",
    turn: 200,
    seed: (s, r) =>
      stateIds(s, r).map((id) =>
        completed(s, id, { updatedAt: new Date(NOW.getTime() - 60_000), endTurn: 250 })
      ),
  },
  { name: "gate-closed", turn: 300, gate: "coming-soon", seed: () => [] },
];

function describeDoc(doc: Doc): string {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
  return [
    `${doc.countryId}/${doc.electionType}/${doc.state}`,
    `c${doc.cycle}`,
    `y${doc.electionYear}`,
    String(doc.status),
    `seats=${doc.totalSeats}`,
    `turns=${doc.startTurn}/${doc.primaryEndTurn}/${doc.endTurn}`,
    `dur=${doc.durationHours}/${doc.primaryDurationHours}`,
    `seat=${doc.seatId}`,
    `shift=${doc.shiftedScheduleEndTurn ?? "-"}`,
    `t=${iso(doc.startTime)}|${iso(doc.primaryEndTime)}|${iso(doc.endTime)}`,
  ].join(" ");
}

describe("IE and NG schedule parity", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(fakeDb());
  });

  it.each(ERAS)(
    "matches the recorded schedule for era %s",
    async (era) => {
      const spawners = await loadSpawners();
      const startingYear = Number.parseInt(era, 10);
      const out: string[] = [];
      for (const scenario of SCENARIOS) {
        for (const spawner of spawners) {
          const regions = regionsFor(spawner.countryId);
          dbState.states = regions;
          dbState.elections = scenario.seed(spawner, regions);
          dbState.inserted = [];
          dbState.accessStatus = scenario.gate ?? "active";
          dbState.gameState = {
            _id: "current",
            currentTurn: scenario.turn,
            preset: era,
            startingYear,
          };
          await spawner.run(NOW, scenario.turn);
          const lines = dbState.inserted.map(describeDoc).sort();
          out.push(`## ${scenario.name} ${spawner.name}`, ...(lines.length ? lines : ["(none)"]));
        }
      }
      await expect(out.join("\n") + "\n").toMatchFileSnapshot(
        `./__snapshots__/chamberParity.${era}.txt`
      );
    },
    60_000
  );
});
