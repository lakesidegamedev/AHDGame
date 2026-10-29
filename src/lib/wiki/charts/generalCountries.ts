import type { WikiChartBuilder, WikiChartSpec } from "./types";
import { largestRemainderSeats } from "@/lib/turn/election/seatAllocation";
import { getMultiSeatMinShare } from "@/lib/turn/election/rules/seatEligibility";
import {
  allocateViaSainteLague,
  BUNDESTAG_VOTE_THRESHOLD,
  DIRECT_MANDATE_EXCEPTION,
} from "@/lib/turn/election/sainteLagueAllocation";
import {
  UK_COMMONS_SEATS,
  UK_REGIONAL_COUNCIL_SEATS,
  UK_REGION_NAMES,
  NG_REGIONAL_COUNCIL_SEATS,
} from "@/lib/constants/states";
import {
  JP_SHUGIIN_SEATS,
  JP_SANGIIN_SEATS,
  TOTAL_JP_SHUGIIN_SEATS,
} from "@/lib/countries/jp/data/jpSeats";
import { brRegions } from "@/lib/countries/br/data/brRegions";
import { ngRegions } from "@/lib/countries/ng/data/ngRegions";
import { BR_ECONOMY } from "@/lib/countries/br/economy";
import {
  CONFIDENCE_BANDS,
  INITIAL_CONFIDENCE,
  RENEWAL_BUMP,
  MAX_CONFIDENCE,
  classifyConfidenceBand,
} from "@/lib/onePartyState/rulingPartyConfidence";
import {
  DD_VOLKSKAMMER_1953,
  DD_VOLKSKAMMER_1979,
  type HistoricalSeat,
} from "@/lib/constants/historicalSeats";

const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const majorityOf = (total: number): number => Math.floor(total / 2) + 1;

/** Presentation choices for the sample elections, not game rules. */
const SAMPLE_REGION_SEATS = 10;
const SAMPLE_CHAMBER_SEATS = 100;
const RIVAL_SPLIT = 0.6;

const JP_REGION_NAMES: Record<string, string> = {
  HOK: "Hokkaido",
  TOH: "Tohoku",
  KAN: "Kanto",
  CHU: "Chubu",
  KNS: "Kansai",
  CGK: "Chugoku",
  SHI: "Shikoku",
  KYU: "Kyushu & Okinawa",
};

const ukHareChart: WikiChartBuilder = (): WikiChartSpec => {
  const minShare = getMultiSeatMinShare("commons");
  const shares: number[] = [];
  for (let s = 0; s <= 40; s += 1) shares.push(s);
  const won: [number, number][] = [];
  const entitled: [number, number][] = [];
  for (const s of shares) {
    const votes = s * 10;
    const rest = 1000 - votes;
    const result = largestRemainderSeats(
      [
        { id: "you", votes, party: "you" },
        { id: "a", votes: rest * RIVAL_SPLIT, party: "a" },
        { id: "b", votes: rest * (1 - RIVAL_SPLIT), party: "b" },
      ],
      SAMPLE_REGION_SEATS,
      { minShare, totalVotesForShare: 1000 }
    );
    won.push([s, result.seats.you]);
    entitled.push([s, round4((s / 100) * SAMPLE_REGION_SEATS)]);
  }
  return {
    title: `Seats won in a ${SAMPLE_REGION_SEATS}-seat region against vote share`,
    kind: "line",
    xLabel: "Your party's share of the regional vote",
    yLabel: "Seats won",
    unit: "seats",
    series: [
      { name: "Seats actually won", points: won },
      { name: "Strictly proportional share", points: entitled },
    ],
    markers: [{ x: minShare * 100, label: "Qualifying line" }],
    caption:
      "Below the qualifying line a party wins nothing, and its votes pass to the parties that cleared it.",
  };
};

const deThresholdChart: WikiChartBuilder = (): WikiChartSpec => {
  const run = (directMandates: number): [number, number][] => {
    const points: [number, number][] = [];
    for (let s = 0; s <= 12; s += 0.25) {
      const votes = s * 10;
      const rest = 1000 - votes;
      const result = allocateViaSainteLague(
        [
          { partyId: "you", votes },
          { partyId: "a", votes: rest * RIVAL_SPLIT },
          { partyId: "b", votes: rest * (1 - RIVAL_SPLIT) },
        ],
        SAMPLE_CHAMBER_SEATS,
        { minVoteShare: BUNDESTAG_VOTE_THRESHOLD, minDirectMandates: { you: directMandates } }
      );
      points.push([s, result.partySeats.you ?? 0]);
    }
    return points;
  };
  return {
    title: `List seats won in a ${SAMPLE_CHAMBER_SEATS}-seat chamber against national vote share`,
    kind: "line",
    xLabel: "Your party's share of the national list vote",
    yLabel: "Seats won",
    unit: "seats",
    series: [
      { name: "No direct mandates", points: run(0) },
      {
        name: `${DIRECT_MANDATE_EXCEPTION} direct mandates won`,
        points: run(DIRECT_MANDATE_EXCEPTION),
      },
    ],
    markers: [{ x: BUNDESTAG_VOTE_THRESHOLD * 100, label: "Vote threshold" }],
    caption:
      "A party under the threshold gets no list seats, unless it wins enough constituency seats outright to be let in.",
  };
};

const ukSeatsChart: WikiChartBuilder = (): WikiChartSpec => {
  const ids = Object.keys(UK_COMMONS_SEATS);
  const total = sum(Object.values(UK_COMMONS_SEATS));
  return {
    title: "Commons seats and Regional Council seats by region",
    kind: "bar",
    xLabel: "Nation or region",
    yLabel: "Seats",
    unit: "seats",
    categories: ids.map((id) => UK_REGION_NAMES[id] ?? id),
    series: [
      { name: "Commons seats", points: ids.map((id, i) => [i, UK_COMMONS_SEATS[id]]) },
      {
        name: "Regional Council seats",
        points: ids.map((id, i) => [i, UK_REGIONAL_COUNCIL_SEATS[id] ?? 0]),
      },
    ],
    caption: `The Commons has ${total} seats, so a majority needs ${majorityOf(total)}.`,
  };
};

const jpSeatsChart: WikiChartBuilder = (): WikiChartSpec => {
  const ids = Object.keys(JP_SHUGIIN_SEATS);
  return {
    title: "Shugiin and Sangiin seats by region",
    kind: "bar",
    xLabel: "Region",
    yLabel: "Seats",
    unit: "seats",
    categories: ids.map((id) => JP_REGION_NAMES[id] ?? id),
    series: [
      { name: "Shugiin (lower house)", points: ids.map((id, i) => [i, JP_SHUGIIN_SEATS[id]]) },
      { name: "Sangiin (upper house)", points: ids.map((id, i) => [i, JP_SANGIIN_SEATS[id] ?? 0]) },
    ],
    caption: `A Shugiin majority is ${majorityOf(TOTAL_JP_SHUGIIN_SEATS)} of ${TOTAL_JP_SHUGIIN_SEATS} seats, and Kanto alone holds ${JP_SHUGIIN_SEATS.KAN}.`,
  };
};

const brSeatsChart: WikiChartBuilder = (): WikiChartSpec => ({
  title: "Chamber and Senate seats by macro-region",
  kind: "bar",
  xLabel: "Macro-region",
  yLabel: "Seats",
  unit: "seats",
  categories: brRegions.map((r) => r.name),
  series: [
    { name: "Chamber of Deputies", points: brRegions.map((r, i) => [i, r.houseDistricts]) },
    { name: "Federal Senate", points: brRegions.map((r, i) => [i, r.stateSenateSeats]) },
  ],
  caption: "The Senate is spread far more evenly across regions than the Chamber.",
});

const brMonetaryChart: WikiChartBuilder = (): WikiChartSpec => {
  const eras = Object.keys(BR_ECONOMY.monetary.byEra);
  return {
    title: "Brazil's inflation target and neutral interest rate by era",
    kind: "bar",
    xLabel: "Era",
    yLabel: "Percent",
    unit: "%",
    categories: eras,
    series: [
      {
        name: "Target inflation",
        points: eras.map((e, i) => [i, BR_ECONOMY.monetary.byEra[e].targetInflation]),
      },
      {
        name: "Neutral prime rate",
        points: eras.map((e, i) => [i, BR_ECONOMY.monetary.byEra[e].neutralPrimeRate]),
      },
    ],
    caption: "Later eras tolerate much higher inflation and carry a higher neutral rate.",
  };
};

const cnConfidenceChart: WikiChartBuilder = (): WikiChartSpec => {
  const points: [number, number][] = [];
  const rank = (v: number) =>
    CONFIDENCE_BANDS.length -
    CONFIDENCE_BANDS.findIndex((b) => b.label === classifyConfidenceBand(v));
  for (let v = 0; v <= 100; v++) points.push([v, rank(v)]);
  return {
    title: "Leader confidence and its bands",
    kind: "step",
    xLabel: "Party confidence in the leader",
    yLabel: "Band (1 = critical, 6 = secure)",
    series: [{ name: "Confidence band", points }],
    markers: [
      ...CONFIDENCE_BANDS.filter((b) => b.min > 0).map((b) => ({
        x: b.min,
        label: `Band starts: ${b.label}`,
      })),
      { x: INITIAL_CONFIDENCE, label: "New leader starts" },
      { x: MAX_CONFIDENCE, label: `Cap (renewal adds ${RENEWAL_BUMP})` },
    ],
    caption: "Confidence is capped below 100, so even a renewed leader can never be fully safe.",
  };
};

const ngSeatsChart: WikiChartBuilder = (): WikiChartSpec => {
  const zones = ngRegions;
  return {
    title: "National Assembly and State Assembly seats by zone",
    kind: "bar",
    stacked: true,
    xLabel: "Geopolitical zone",
    yLabel: "Seats",
    unit: "seats",
    categories: zones.map((z) => z.name),
    series: [
      { name: "House of Representatives", points: zones.map((z, i) => [i, z.houseDistricts]) },
      { name: "Senate", points: zones.map((z, i) => [i, z.stateSenateSeats]) },
      {
        name: "State Houses of Assembly",
        points: zones.map((z, i) => [i, NG_REGIONAL_COUNCIL_SEATS[z._id] ?? 0]),
      },
    ],
    caption:
      "State Houses of Assembly dwarf the two national chambers, and the North-West is largest in all three.",
  };
};

const DD_PARTIES: { id: string; name: string }[] = [
  { id: "dd_sed", name: "SED" },
  { id: "dd_cdu", name: "CDU" },
  { id: "dd_ldpd", name: "LDPD" },
  { id: "dd_ndpd", name: "NDPD" },
  { id: "dd_dbd", name: "DBD" },
];

const ddVolkskammerChart: WikiChartBuilder = (): WikiChartSpec => {
  const total = (seats: HistoricalSeat[], party: string): number =>
    sum(seats.filter((s) => s.party === party).map((s) => s.seatsHeld ?? 0));
  return {
    title: "Volkskammer seats by party, 1953 and 1979",
    kind: "bar",
    stacked: true,
    xLabel: "Start year",
    yLabel: "Seats",
    unit: "seats",
    categories: ["1953", "1979"],
    series: DD_PARTIES.map((p) => ({
      name: p.name,
      points: [
        [0, total(DD_VOLKSKAMMER_1953, p.id)],
        [1, total(DD_VOLKSKAMMER_1979, p.id)],
      ] as [number, number][],
    })),
    caption: "The SED holds the largest block in both eras, and the allied parties split the rest.",
  };
};

export const GENERAL_COUNTRY_CHARTS: Record<string, WikiChartBuilder> = {
  "uk-regional-seat-allocation": ukHareChart,
  "de-vote-threshold-seats": deThresholdChart,
  "uk-seats-by-region": ukSeatsChart,
  "jp-seats-by-region": jpSeatsChart,
  "br-seats-by-region": brSeatsChart,
  "br-monetary-targets-by-era": brMonetaryChart,
  "cn-leader-confidence-bands": cnConfidenceChart,
  "ng-seats-by-zone": ngSeatsChart,
  "dd-volkskammer-seats-by-party": ddVolkskammerChart,
};
