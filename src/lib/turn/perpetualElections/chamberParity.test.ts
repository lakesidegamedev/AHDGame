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
import { dataPresetFor } from "@/lib/seeds/presetSelector";
import { REGION_TABLES } from "@/lib/seeds/contract/regionTables";
import { NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import { IE_DAIL_SEATS_PER_REGION } from "@/lib/seeds/ie/ieRegions";
import { NG_SEATS_PER_REGION } from "@/lib/seeds/ng/ngRegions";
import { IE_LOCAL_COUNCIL_SEATS } from "@/lib/countries/ie/data/ieLocalCouncilSeats";

type Doc = Record<string, unknown>;

const dbState = vi.hoisted(() => ({
  states: [] as Doc[],
  elections: [] as Doc[],
  gameState: null as Doc | null,
  inserted: [] as Doc[],
  healed: [] as Doc[],
  accessStatus: "active",
  landeslisten: [] as unknown[],
}));

vi.mock("@/lib/elections/germanyLandesliste", () => ({
  generateLandeslistenForCycle: vi.fn(async (_db: unknown, cycle: unknown) => {
    dbState.landeslisten.push(cycle);
  }),
}));
vi.mock("@/lib/countries/de/elections/germanyLandesliste", () => ({
  generateLandeslistenForCycle: vi.fn(async (_db: unknown, cycle: unknown) => {
    dbState.landeslisten.push(cycle);
  }),
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
      bulkWrite: async (ops: Doc[]) => {
        dbState.healed.push(...ops);
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
  countryId: string;
  electionType: string;
  national: boolean;
  /** The chamber has a snap election type that shifts its term clock. */
  snap?: boolean;
  /** Staggered classes: every seeded election is written once per class. */
  classes?: (1 | 2)[];
  run: (now: Date, turn: number) => Promise<void>;
}

interface Group {
  /** Snapshot file infix; empty keeps the original IE and NG file names. */
  id: string;
  title: string;
  spawners: () => Promise<Spawner[]>;
  regionsFor: (countryId: string, era: string) => Doc[];
  scenarios: Scenario[];
}

function spawner(
  name: string,
  countryId: string,
  electionType: string,
  national: boolean,
  run: Spawner["run"],
  snap = false,
  classes?: (1 | 2)[]
): Spawner {
  return {
    name,
    countryId,
    electionType,
    national,
    run,
    ...(snap ? { snap } : {}),
    ...(classes ? { classes } : {}),
  };
}

async function deSpawners(): Promise<Spawner[]> {
  const de = await import("@/lib/countries/de/elections/perpetual");
  const landtag = await import("@/lib/countries/de/elections/germanyLandtag");
  return [
    spawner("de.bundestag", "DE", "bundestag", false, de.ensureDEElections, true),
    spawner("de.landtag", "DE", "landtag", false, landtag.ensureDELandtagElections),
  ];
}

async function jpSpawners(): Promise<Spawner[]> {
  const jp = await import("@/lib/countries/jp/elections/perpetual");
  return [
    spawner("jp.shugiin", "JP", "shugiin", false, jp.ensureJPElections, true),
    spawner(
      "jp.sangiin",
      "JP",
      "sangiin",
      false,
      (now, turn) => jp.ensureJPCouncillorElections(now, undefined, turn),
      false,
      [1, 2]
    ),
  ];
}

async function ieNgSpawners(): Promise<Spawner[]> {
  const ie = await import("@/lib/countries/ie/elections/perpetual");
  const ng = await import("@/lib/countries/ng/elections/perpetual");
  return [
    spawner("ie.dail", "IE", "dail", false, ie.ensureIEElections),
    spawner("ie.uachtaran", "IE", "uachtaran", true, ie.ensureIEUachtaranElections),
    spawner("ie.localCouncil", "IE", "localCouncil", false, ie.ensureIELocalCouncilElections),
    spawner("ng.house", "NG", "house", false, ng.ensureNGElections),
    spawner("ng.senate", "NG", "senate", false, ng.ensureNGSenateElections),
    spawner("ng.governor", "NG", "governor", false, ng.ensureNGGovernorElections),
    spawner(
      "ng.regionalCouncil",
      "NG",
      "regionalCouncil",
      false,
      ng.ensureNGRegionalCouncilElections
    ),
    spawner("ng.president", "NG", "president", true, ng.ensureNGPresidentialElection),
  ];
}

async function betaSpawners(): Promise<Spawner[]> {
  const b = await import("@/lib/turn/perpetualElections/countries/betaParliaments");
  return [
    spawner("fr.assembleeNationale", "FR", "assembleeNationale", false, b.ensureFRElections, true),
    spawner("it.cameraDeputati", "IT", "cameraDeputati", false, b.ensureITElections, true),
    spawner("es.congresoDiputados", "ES", "congresoDiputados", false, b.ensureESElections, true),
    spawner("se.riksdag", "SE", "riksdag", false, b.ensureSEElections, true),
    spawner("tr.milletMeclisi", "TR", "milletMeclisi", false, b.ensureTRElections, true),
    spawner("gr.vouli", "GR", "vouli", false, b.ensureGRElections, true),
    spawner("at.nationalrat", "AT", "nationalrat", false, b.ensureATElections, true),
    spawner("fi.eduskunta", "FI", "eduskunta", false, b.ensureFIElections, true),
  ];
}

async function betaSenateSpawners(): Promise<Spawner[]> {
  const b = await import("@/lib/turn/perpetualElections/countries/betaParliaments");
  return [
    spawner("fr.senat", "FR", "senat", false, b.ensureFRSenateElections),
    spawner("it.senato", "IT", "senato", false, b.ensureITSenateElections),
    spawner("es.senado", "ES", "senado", false, b.ensureESSenateElections),
    spawner("tr.senato", "TR", "senato", false, b.ensureTRSenateElections),
  ];
}

async function cnSpawners(): Promise<Spawner[]> {
  const cn = await import("@/lib/countries/cn/elections/perpetual");
  return [
    spawner("cn.npcDelegate", "CN", "npcDelegate", false, cn.ensureCNElections),
    spawner(
      "cn.peoplesCongress",
      "CN",
      "peoplesCongress",
      false,
      cn.ensureCNPeoplesCongressElections
    ),
    spawner("cn.governor", "CN", "governor", false, cn.ensureCNGovernorElections),
  ];
}

async function brSpawners(): Promise<Spawner[]> {
  const br = await import("@/lib/countries/br/elections/perpetual");
  return [
    spawner("br.chamber", "BR", "chamber", false, br.ensureBRElections),
    spawner("br.senate", "BR", "senate", false, br.ensureBRSenateElections),
    spawner("br.governor", "BR", "governor", false, br.ensureBRGovernorElections),
  ];
}

function ieNgRegions(countryId: string): Doc[] {
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
    .map((id) => ({ _id: id, countryId, houseDistricts: 1 }));
  return [...dail, ...extra];
}

/** The regions a reset of `era` seeds for the country. */
function seededRegions(countryId: string, era: string): Doc[] {
  const table = REGION_TABLES[countryId]?.table ?? {};
  const rows = table[dataPresetFor(era) as keyof typeof table] ?? [];
  return rows.filter((r) => !NATIONAL_SCOPE_IDS.has(String(r._id))) as unknown as Doc[];
}

interface Scenario {
  name: string;
  turn: number;
  gate?: string;
  snapOnly?: boolean;
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

function live(s: Spawner, state: string, over: Doc = {}): Doc {
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
    ...over,
  };
}

const stateIds = (s: Spawner, regions: Doc[]): string[] =>
  s.national ? [s.countryId] : regions.map((r) => r._id as string);

const BASE_SCENARIOS: Scenario[] = [
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

const snapOf = (s: Spawner): string => `snap_${s.electionType}`;
const HOURS_AGO = (h: number): Date => new Date(NOW.getTime() - h * 3_600_000);

const SNAP_SCENARIOS: Scenario[] = [
  {
    name: "after-called-snap",
    turn: 450,
    snapOnly: true,
    seed: (s, r) =>
      stateIds(s, r).map((id) =>
        completed(s, id, {
          electionType: snapOf(s),
          cycle: 4,
          endTime: HOURS_AGO(30),
          endTurn: 420,
        })
      ),
  },
  {
    name: "after-imposed-snap",
    turn: 450,
    snapOnly: true,
    seed: (s, r) =>
      stateIds(s, r).map((id) =>
        completed(s, id, {
          electionType: snapOf(s),
          cycle: 4,
          imposedSnap: true,
          endTime: HOURS_AGO(30),
          endTurn: 420,
        })
      ),
  },
  {
    name: "after-shifted-regular",
    turn: 450,
    snapOnly: true,
    seed: (s, r) =>
      stateIds(s, r).map((id) =>
        completed(s, id, {
          cycle: 4,
          endTime: HOURS_AGO(30),
          endTurn: 420,
          shiftedScheduleEndTurn: 380,
        })
      ),
  },
  {
    name: "live-snap",
    turn: 450,
    snapOnly: true,
    seed: (s, r) => stateIds(s, r).map((id) => live(s, id, { electionType: snapOf(s) })),
  },
  {
    name: "mixed-snap-and-regular-history",
    turn: 450,
    snapOnly: true,
    seed: (s, r) => {
      const ids = stateIds(s, r);
      return [
        ...ids.slice(0, 1).map((id) =>
          completed(s, id, {
            electionType: snapOf(s),
            cycle: 5,
            endTime: HOURS_AGO(40),
            endTurn: 410,
          })
        ),
        ...ids.slice(1).map((id) => completed(s, id, { cycle: 2, endTurn: 300 })),
      ];
    },
  },
];

const GROUPS: Group[] = [
  {
    id: "de.",
    title: "DE",
    spawners: deSpawners,
    regionsFor: seededRegions,
    scenarios: [...BASE_SCENARIOS, ...SNAP_SCENARIOS],
  },
  {
    id: "jp.",
    title: "JP",
    spawners: jpSpawners,
    regionsFor: seededRegions,
    scenarios: [...BASE_SCENARIOS, ...SNAP_SCENARIOS],
  },
  {
    id: "",
    title: "IE and NG",
    spawners: ieNgSpawners,
    regionsFor: ieNgRegions,
    scenarios: BASE_SCENARIOS,
  },
  {
    id: "beta.",
    title: "beta parliaments",
    spawners: betaSpawners,
    regionsFor: seededRegions,
    scenarios: [...BASE_SCENARIOS, ...SNAP_SCENARIOS],
  },
  {
    id: "senate.",
    title: "beta senates",
    spawners: betaSenateSpawners,
    regionsFor: seededRegions,
    scenarios: BASE_SCENARIOS,
  },
  {
    id: "cn.",
    title: "CN",
    spawners: cnSpawners,
    regionsFor: seededRegions,
    scenarios: BASE_SCENARIOS,
  },
  {
    id: "br.",
    title: "BR",
    spawners: brSpawners,
    regionsFor: seededRegions,
    scenarios: BASE_SCENARIOS,
  },
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
    ...(doc.chamberClass ? [`class=${doc.chamberClass}`] : []),
    ...(doc.allocationMethod ? [`alloc=${doc.allocationMethod}`] : []),
    ...(doc.japanShugiinRules ? [`jpRules=${JSON.stringify(doc.japanShugiinRules)}`] : []),
    `t=${iso(doc.startTime)}|${iso(doc.primaryEndTime)}|${iso(doc.endTime)}`,
  ].join(" ");
}

function describeHeal(op: Doc): string {
  const update = (op.updateOne as { update: { $set: Doc } }).update.$set;
  if ("allocationMethod" in update) return `heal method=${update.allocationMethod}`;
  return `heal seats=${update.totalSeats}`;
}

describe.each(GROUPS)("$title schedule parity", (group) => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(fakeDb());
  });

  it.each(ERAS)(
    "matches the recorded schedule for era %s",
    async (era) => {
      const spawners = await group.spawners();
      const startingYear = Number.parseInt(era, 10);
      const out: string[] = [];
      for (const scenario of group.scenarios) {
        for (const sp of spawners) {
          if (scenario.snapOnly && !sp.snap) continue;
          const regions = group.regionsFor(sp.countryId, era);
          dbState.states = regions;
          const seeded = scenario.seed(sp, regions);
          dbState.elections = sp.classes
            ? seeded.flatMap((d) => sp.classes!.map((c) => ({ ...d, chamberClass: c })))
            : seeded;
          dbState.inserted = [];
          dbState.healed = [];
          dbState.landeslisten = [];
          dbState.accessStatus = scenario.gate ?? "active";
          dbState.gameState = {
            _id: "current",
            currentTurn: scenario.turn,
            preset: era,
            startingYear,
          };
          await sp.run(NOW, scenario.turn);
          const lines = [
            ...dbState.inserted.map(describeDoc).sort(),
            ...dbState.healed.map(describeHeal).sort(),
            ...(dbState.landeslisten.length
              ? [`landeslisten cycles=${[...new Set(dbState.landeslisten)].join(",")}`]
              : []),
          ];
          out.push(`## ${scenario.name} ${sp.name}`, ...(lines.length ? lines : ["(none)"]));
        }
      }
      await expect(out.join("\n") + "\n").toMatchFileSnapshot(
        `./__snapshots__/chamberParity.${group.id}${era}.txt`
      );
    },
    60_000
  );
});
