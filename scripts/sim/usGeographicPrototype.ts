/** Offline US House experiment. No Mongo, production imports or live game writes. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  allocatePrototypeBallots,
  apportionPrototype,
  blendPrototypeEvidence,
  countPrototypeDistricts,
  PROTOTYPE_VERSION,
  transferPrototype,
  type PrototypeSpot,
} from "../../src/lib/redistricting/rules/usGeographicPrototype";

const SOURCES = {
  "presidential-totals.csv":
    "https://docs.google.com/spreadsheets/d/1eZfaFI-c-PFOoKx1-zZA2MP0_dxRq_LVK0re3BOQqy0/export?format=csv&gid=1491069057",
  "ca-presidential-parts.csv":
    "https://docs.google.com/spreadsheets/d/1HFC7LLKVhDKwPPQFjMCyRlt9ZAaii7xrQ-Bn4Hl6cZw/export?format=csv",
  "V26GG.txt": "https://media.sos.ca.gov/media/V26GG.txt",
  "C26GG.txt": "https://media.sos.ca.gov/media/C26GG.txt",
  "S26GG.txt": "https://media.sos.ca.gov/media/S26GG.txt",
};
function csv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unterminated CSV field");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
function count(raw: string): number {
  if (!/^[\d,]+$/.test(raw)) throw new Error(`Invalid source count: ${raw}`);
  const value = Number(raw.replaceAll(",", ""));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid count");
  return value;
}
function media(text: string): string[][] {
  return text
    .split(/[\r\n]+/)
    .filter((l) => l.startsWith("["))
    .map((l) => l.slice(1, -1).split("|"));
}
function flag(name: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? "") : "";
}
const inputDir = flag("--inputs"),
  output = flag("--out");
if (!inputDir)
  throw new Error(
    "Usage: tsx scripts/sim/usGeographicPrototype.ts --inputs <snapshot-directory> [--out <external-report.json>]"
  );
const manifest = Object.entries(SOURCES).map(([file, url]) => {
  const bytes = readFileSync(resolve(inputDir, file));
  return {
    file,
    url,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
});
const read = (file: keyof typeof SOURCES) => readFileSync(resolve(inputDir, file), "utf8");
const totals = new Map(
  csv(read("presidential-totals.csv"))
    .filter((r) => /^CA-\d+$/.test(r[0]))
    .map((r) => [r[0], [count(r[4]), count(r[5])]])
);
if (totals.size !== 52) throw new Error("Expected all 52 California presidential districts");
const spots: PrototypeSpot[] = [],
  baselineVotes = new Map<string, [number, number]>();
let district = "";
for (const row of csv(read("ca-presidential-parts.csv"))) {
  if (/^\d+$/.test(row[0])) district = `CA-${row[0].padStart(2, "0")}`;
  if (!district || !row[1] || !/^[\d,]+$/.test(row[2])) continue;
  const countyId = row[1].replace(/ \(pt\.\)$/, "");
  const left = count(row[2]),
    right = count(row[3]),
    ballots = left + right;
  if (!ballots) continue;
  const id = `${countyId}:${district}`;
  if (baselineVotes.has(id)) throw new Error(`Duplicate overlap ${id}`);
  baselineVotes.set(id, [left, right]);
  spots.push({ id, countyId, districtId: district, ballots, lean: (100 * right) / ballots - 50 });
}
const presidentialRoundingDiscrepancies: { id: string; differences: number[] }[] = [];
for (const [id, expected] of totals) {
  const actual = spots
    .filter((s) => s.districtId === id)
    .reduce(
      (v, s) => {
        const row = baselineVotes.get(s.id)!;
        return [v[0] + row[0], v[1] + row[1]];
      },
      [0, 0]
    );
  const differences = actual.map((v, i) => v - expected[i]);
  if (differences.some((v) => Math.abs(v) > 1))
    throw new Error(`Presidential overlap mismatch ${id}`);
  if (differences.some(Boolean)) presidentialRoundingDiscrepancies.push({ id, differences });
}
const candidates = new Map(
  media(read("C26GG.txt"))
    .filter((r) => r[0] === "C")
    .map((r) => [`${r[3]}:${r[4]}`, r[9]])
);
const counties = new Map(
  media(read("S26GG.txt"))
    .filter((r) => r[0] === "S")
    .map((r) => [Number(r[3]), r[4]])
);
const observations = new Map<string, { left: number; right: number; reason: string | null }>();
const districtObservations = new Map<string, [number, number]>();
const rejected: Record<string, number> = {};
for (const row of media(read("V26GG.txt"))) {
  if (row[0] !== "V" || !/^110000\d{2}0000$/.test(row[3])) continue;
  const districtId = `CA-${row[3].slice(6, 8)}`;
  const candidateRows: { party: string | undefined; votes: number }[] = [];
  for (let i = 8; i + 3 < row.length; i += 4)
    candidateRows.push({ party: candidates.get(`${row[3]}:${row[i]}`), votes: count(row[i + 1]) });
  const d = candidateRows.filter((r) => r.party === "01"),
    r = candidateRows.filter((r) => r.party === "02");
  const reason =
    candidateRows.length !== 2 || d.length !== 1 || r.length !== 1
      ? "not_one_democrat_and_one_republican"
      : d[0].votes + r[0].votes < 500
        ? "fewer_than_500_two_party_ballots"
        : null;
  if (Number(row[4]) === 59) {
    if (!reason) districtObservations.set(districtId, [d[0].votes, r[0].votes]);
    continue;
  }
  const county = counties.get(Number(row[4]));
  if (!county) throw new Error("Unknown official county code");
  const key = `${county}:${districtId}`;
  if (observations.has(key)) throw new Error(`Duplicate official overlap ${key}`);
  if (reason) rejected[reason] = (rejected[reason] ?? 0) + 1;
  observations.set(key, { left: d[0]?.votes ?? 0, right: r[0]?.votes ?? 0, reason });
}
const evidence = spots.map((s) => {
  const obs = observations.get(s.id);
  return {
    id: s.id,
    weight: s.ballots,
    baselineShare: 0.5 + s.lean / 100,
    observedShare:
      obs && !obs.reason && districtObservations.has(s.districtId)
        ? obs.right / (obs.left + obs.right)
        : null,
  };
});
if (!evidence.some((r) => r.observedShare !== null)) throw new Error("No comparable 2026 evidence");
const officialOverlapReconciliation = [...districtObservations].map(([districtId, expected]) => {
  const rows = [...observations].filter(([key]) => key.endsWith(`:${districtId}`));
  const actual = rows.reduce((sum, [, r]) => [sum[0] + r.left, sum[1] + r.right], [0, 0]);
  return { districtId, differences: actual.map((v, i) => v - expected[i]) };
});
if (officialOverlapReconciliation.some((r) => r.differences.some((v) => v !== 0)))
  throw new Error(
    "Official county/district returns do not reconcile; obtain a consistent snapshot"
  );
const binding = {
  countryId: "US",
  electionType: "house",
  rulesVersion: PROTOTYPE_VERSION,
  planId: "US-CA-2026-downballot-vote-geography",
};
const total = spots.reduce((s, p) => s + p.ballots, 0);
function run(
  localSpots: PrototypeSpot[],
  shares: number[],
  positions: number[],
  strength: number,
  adapter: "pool" | "continuous"
) {
  const ids = shares.length === 2 ? ["D", "R"] : shares.map((_, i) => `P${i}`);
  const votes = apportionPrototype(total, shares);
  const result = allocatePrototypeBallots({
    binding,
    dataPlanId: binding.planId,
    spots: localSpots,
    strength,
    adapter,
    parties: ids.map((id, i) => ({ id, position: positions[i], votes: votes[i] })),
  });
  const districts = countPrototypeDistricts(
    result.spots,
    result.ballots,
    result.parties.map((p) => p.id)
  );
  const seats: Record<string, number> = {};
  for (const d of districts)
    seats[d.winner ?? "unresolved"] = (seats[d.winner ?? "unresolved"] ?? 0) + 1;
  const rowConserved = result.ballots.every(
    (r, i) => r.reduce((a, b) => a + b, 0) === result.spots[i].ballots
  );
  const columnConserved = result.parties.every(
    (p, j) => result.ballots.reduce((s, r) => s + r[j], 0) === p.votes
  );
  if (!rowConserved || !columnConserved) throw new Error("Conservation failed");
  return { seats, districts, iterations: result.iterations, rowConserved, columnConserved };
}
const comparison = [0, 0.1, 0.25, 0.5].map((weight) => {
  const blend = blendPrototypeEvidence(evidence, weight);
  const byId = new Map(blend.rows.map((r) => [r.id, r.blendedShare]));
  const local = spots.map((s) => ({ ...s, lean: 100 * byId.get(s.id)! - 50 }));
  const result = run(local, [0.5, 0.5], [-1, 1], 1, "continuous");
  const naive = blend.rows
    .filter((r) => r.observedShare !== null)
    .reduce((max, r) => Math.max(max, Math.abs(r.blendedShare - r.baselineShare) * 100), 0);
  return { weight, removedWavePoints: blend.wavePoints, maxInputChangePoints: naive, ...result };
});
const baselineDistricts = comparison[0].districts;
const comparisonMetrics = comparison.map((arm) => {
  const deltas = arm.districts.map((d, i) => {
    const margin = (v: number[]) => (100 * (v[0] - v[1])) / v.reduce((a, b) => a + b, 0);
    return Math.abs(margin(d.votes) - margin(baselineDistricts[i].votes));
  });
  return {
    weight: arm.weight,
    seats: arm.seats,
    meanMarginChangePoints: deltas.reduce((a, b) => a + b, 0) / deltas.length,
    maxMarginChangePoints: Math.max(...deltas),
    changedWinners: arm.districts
      .filter((d, i) => d.winner !== baselineDistricts[i].winner)
      .map((d) => d.id),
  };
});
const reconstructed = run(
  spots,
  [
    [...baselineVotes.values()].reduce((s, v) => s + v[0], 0),
    [...baselineVotes.values()].reduce((s, v) => s + v[1], 0),
  ],
  [-1, 1],
  1,
  "continuous"
);
const reconstructionMaxVotesError = Math.max(
  ...reconstructed.districts.flatMap((d) => {
    const observed = spots
      .filter((s) => s.districtId === d.id)
      .reduce(
        (sum, s) => {
          const v = baselineVotes.get(s.id)!;
          return [sum[0] + v[0], sum[1] + v[1]];
        },
        [0, 0]
      );
    return d.votes.map((v, i) => Math.abs(v - observed[i]));
  })
);
const sweepFields = [
  { name: "centrist-40-30-30", shares: [0.4, 0.3, 0.3], positions: [0, -1, 1] },
  { name: "near-grey-major-parties", shares: [0.4, 0.3, 0.3], positions: [0, -0.5, 0.5] },
  {
    name: "TX-926-vote-field",
    shares: [2164516, 1923861, 1012323, 696833, 140109],
    positions: [0, 0, -1, 1, -1],
  },
  {
    name: "CA-926-vote-field",
    shares: [3220302, 3232693, 2198819, 1375553],
    positions: [-1, 1, 0, -1],
  },
];
const sweeps = sweepFields.flatMap((field) =>
  (["pool", "continuous"] as const).flatMap((adapter) =>
    [0, 0.1, 0.25, 0.5, 1, 2].map((strength) => ({
      field: field.name,
      adapter,
      strength,
      ...run(spots, field.shares, field.positions, strength, adapter),
    }))
  )
);
const closeDistrict = [...baselineDistricts].sort(
  (a, b) =>
    Math.abs(a.votes[0] - a.votes[1]) / (a.votes[0] + a.votes[1]) -
    Math.abs(b.votes[0] - b.votes[1]) / (b.votes[0] + b.votes[1])
)[0].id;
const actionSensitivity = [0.25, 0.5, 1].flatMap((futureFraction) =>
  [0, 0.4, 1.2, 3].map((points) => {
    const result = allocatePrototypeBallots({
      binding,
      dataPlanId: binding.planId,
      spots,
      strength: 1,
      adapter: "continuous",
      parties: [
        { id: "D", position: -1, votes: Math.floor(total / 2) },
        { id: "R", position: 1, votes: total - Math.floor(total / 2) },
      ],
    });
    const target = baselineDistricts.find((d) => d.id === closeDistrict)!;
    const effect = target.votes[0] < target.votes[1] ? [points, 0] : [0, points];
    const changed = result.ballots.map((row, i) => {
      if (result.spots[i].districtId !== closeDistrict) return row;
      const future = apportionPrototype(
        Math.floor(row.reduce((a, b) => a + b, 0) * futureFraction),
        row
      );
      const shifted = transferPrototype(future, effect);
      return row.map((v, j) => v - future[j] + shifted[j]);
    });
    return {
      points,
      futureFraction,
      district: closeDistrict,
      rowsConserved: changed.every(
        (r, i) => r.reduce((a, b) => a + b, 0) === result.spots[i].ballots
      ),
      result: countPrototypeDistricts(result.spots, changed, ["D", "R"]).find(
        (d) => d.id === closeDistrict
      ),
    };
  })
);
const report = {
  version: PROTOTYPE_VERSION,
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  implementationHashes: [
    "scripts/sim/usGeographicPrototype.ts",
    "src/lib/redistricting/rules/usGeographicPrototype.ts",
  ].map((file) => ({
    file,
    sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
  })),
  sourceSnapshotHeader: read("V26GG.txt").split(/[\r\n]/)[0],
  manifest,
  scope:
    "California only; 2024 presidential two-party vote geography on published 2026 lines, provisional 2026 House evidence. No qualified resident crosswalk; no production integration.",
  caveats: [
    "Source redistribution rights not established; inputs kept outside repository.",
    "Experimental 2026 blending is sensitivity analysis, not held-out prediction accuracy.",
    "Evidence uses the same baseline ballot weights in both arms, strips covered statewide wave and clips residuals to 10 share points before blending.",
    "Third-party ballots excluded; game parties and regression-field pool assignments are synthetic, not live measurements.",
    "County/district source joins require official plan verification before production.",
    "Action scenario applies one future batch; duration/cost/decay and real nominee seating are not qualified.",
  ],
  presidentialRoundingDiscrepancies,
  officialOverlapReconciliation,
  coverage: {
    spots: spots.length,
    covered: evidence.filter((e) => e.observedShare !== null).length,
    coveredBallotFraction:
      evidence.filter((e) => e.observedShare !== null).reduce((s, e) => s + e.weight, 0) / total,
    excluded: evidence
      .filter((e) => e.observedShare === null)
      .map((e) => ({
        id: e.id,
        reason:
          observations.get(e.id)?.reason ??
          (districtObservations.has(spots.find((s) => s.id === e.id)!.districtId)
            ? "missing_overlap"
            : "district_not_comparable"),
      })),
    rejected,
  },
  comparison,
  comparisonMetrics,
  reconstructionMaxVotesError,
  sweeps,
  actionSensitivity,
};
const json = JSON.stringify(report, null, 2) + "\n";
if (output) writeFileSync(resolve(output), json);
else process.stdout.write(json);
if (output)
  console.log(
    JSON.stringify(
      {
        output: resolve(output),
        coverage: report.coverage,
        comparison: comparison.map(({ weight, seats, maxInputChangePoints }) => ({
          weight,
          seats,
          maxInputChangePoints,
        })),
      },
      null,
      2
    )
  );
