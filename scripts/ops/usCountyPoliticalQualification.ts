/** Explicit read-only local/live qualification. Outputs aggregates, never connection strings or player identities. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import { parse } from "dotenv";
import { MongoClient, type ObjectId } from "mongodb";
import { activeUserIds } from "../../src/lib/players/playerActivity";
import { quoteTimelineAction } from "../../src/lib/redistricting/rules/campaignTimelinePrototype";

interface World {
  _id: string;
  currentTurn?: number;
  preset?: string;
  worldEpochId?: string;
}
interface Region {
  _id: string;
  population?: number;
  houseDistricts?: number;
}
interface County {
  _id: string;
  stateId: string;
  population: number;
  populationBaseline?: string;
}
interface Org {
  _id: string;
  stateId: string;
  partyId: string;
  politicalStrength?: number;
  psInvestmentBudget?: number;
}
interface Pressure {
  stateId: string;
  partyId: string;
  value?: number;
}
interface Member {
  userId?: ObjectId | null;
  homeState?: string;
  party?: string;
}
const orgKey = (o: { stateId: string; partyId: string }) => `${o.stateId}_${o.partyId}`;
function flag(name: string) {
  const i = process.argv.indexOf(name);
  return i < 0 ? "" : (process.argv[i + 1] ?? "");
}
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => (sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null);
  return { count: sorted.length, min: q(0), p25: q(0.25), median: q(0.5), p75: q(0.75), max: q(1) };
}
async function main() {
  const out = flag("--out"),
    key = flag("--mongo-key") || "MONGODB_URI";
  if (
    !out ||
    !relative(process.cwd(), resolve(out)).startsWith("..") ||
    !["MONGODB_URI", "MONGODB_URI_LIVE"].includes(key)
  )
    throw new Error("Use an explicit Mongo key and an output path outside the repository");
  const env = parse(readFileSync(flag("--env-file") || ".env.local"));
  const uri = env[key];
  if (!uri) throw new Error("Selected Mongo key is not configured");
  const address = new URL(uri);
  const dbName =
    address.pathname.length > 1 ? decodeURIComponent(address.pathname.slice(1)) : "a-house-divided";
  const client = new MongoClient(uri, {
    family: 4,
    appName: "us-geographic-readonly-qualification",
    retryWrites: false,
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 15000,
    monitorCommands: true,
  });
  const commands: Record<string, number> = {};
  client.on("commandStarted", (event) => {
    commands[event.commandName] = (commands[event.commandName] ?? 0) + 1;
  });
  try {
    await client.connect();
    const db = client.db(dbName);
    const now = new Date();
    const worldProjection = { currentTurn: 1, preset: 1, worldEpochId: 1 };
    const before = await db
      .collection<World>("gameState")
      .findOne({ _id: "current" }, { projection: worldProjection, maxTimeMS: 5000 });
    if (!before || !Number.isSafeInteger(before.currentTurn)) throw new Error("Missing world turn");
    const turn = before.currentTurn!;
    const [regions, counties, orgs, pressures, positions, ledger] = await Promise.all([
      db
        .collection<Region>("states")
        .find(
          { countryId: "US" },
          { projection: { _id: 1, population: 1, houseDistricts: 1 }, maxTimeMS: 5000 }
        )
        .toArray(),
      db
        .collection<County>("counties")
        .find(
          { countryId: "US" },
          {
            projection: { _id: 1, stateId: 1, population: 1, populationBaseline: 1 },
            maxTimeMS: 5000,
          }
        )
        .toArray(),
      db
        .collection<Org>("statePartyOrg")
        .find(
          { countryId: "US" },
          {
            projection: {
              _id: 1,
              stateId: 1,
              partyId: 1,
              politicalStrength: 1,
              psInvestmentBudget: 1,
            },
            maxTimeMS: 5000,
          }
        )
        .toArray(),
      db
        .collection<Pressure>("partyStrengthPressure")
        .find(
          { countryId: "US" },
          { projection: { _id: 0, stateId: 1, partyId: 1, value: 1 }, maxTimeMS: 5000 }
        )
        .toArray(),
      db
        .collection("politicalParties")
        .find({ countryId: "US" }, { projection: { _id: 0, economicPosition: 1 }, maxTimeMS: 5000 })
        .toArray(),
      db
        .collection("partyPoliticalStrengthLedger")
        .aggregate(
          [
            { $match: { countryId: "US", turn: { $gte: Math.max(0, turn - 71), $lte: turn } } },
            {
              $group: {
                _id: {
                  source: "$source",
                  action: "$action",
                  geographic: { $ne: [{ $ifNull: ["$stateId", null] }, null] },
                },
                rows: { $sum: 1 },
                delta: { $sum: "$delta" },
                firstTurn: { $min: "$turn" },
                lastTurn: { $max: "$turn" },
              },
            },
          ],
          { maxTimeMS: 10000 }
        )
        .toArray(),
    ]);
    const regionIds = regions.map((r) => r._id);
    const members = await db
      .collection<Member>("characters")
      .find(
        { homeState: { $in: regionIds }, userId: { $ne: null } },
        { projection: { _id: 0, homeState: 1, party: 1, userId: 1 }, maxTimeMS: 5000 }
      )
      .toArray();
    const active = await activeUserIds(
      db,
      members.flatMap((m) => (m.userId ? [m.userId] : [])),
      now
    );
    const memberKeys = new Set(
      members
        .filter((m) => m.party && m.homeState && m.userId && active.has(m.userId.toString()))
        .map((m) => `${m.homeState}_${m.party}`)
    );
    const votingStates = new Set(
      regions.filter((r) => (r.houseDistricts ?? 0) > 0).map((r) => r._id)
    );
    const relevant = orgs.filter((o) => votingStates.has(o.stateId));
    const pressureByKey = new Map(
      pressures.map((p) => [`${p.stateId}_${p.partyId}`, Math.max(0, p.value ?? 0)])
    );
    function budget(rows: Org[]) {
      const reserves = rows.map((o) => o.politicalStrength ?? 0);
      if (reserves.some((v) => !Number.isFinite(v) || v < 0))
        throw new Error("Invalid observed reserve");
      return {
        reserves: summary(reserves),
        investmentEnabled: rows.filter((o) => (o.psInvestmentBudget ?? 0) > 0).length,
        canAffordOneDistrict: rows.filter(
          (o) =>
            (o.politicalStrength ?? 0) >=
            quoteTimelineAction(2, pressureByKey.get(orgKey(o)) ?? 0, 8, 1, true)
        ).length,
        canAffordTwoSequentialDistricts: rows.filter((o) => {
          const p = pressureByKey.get(orgKey(o)) ?? 0;
          return (
            (o.politicalStrength ?? 0) >=
            quoteTimelineAction(2, p, 8, 1, true) +
              quoteTimelineAction(2, Math.min(8, p + 1), 8, 1, true)
          );
        }).length,
      };
    }
    const populationReportPath = flag("--population-report");
    let referenceCountyAffordability = null;
    if (populationReportPath) {
      const pop = JSON.parse(readFileSync(populationReportPath, "utf8")) as {
        quotes: {
          countyName: string;
          population: number;
          districts: number;
          initialQuotePs: number;
        }[];
        medianProjectedDistrictPopulation: number;
      };
      const caOrgs = relevant.filter((o) => o.stateId === "CA");
      referenceCountyAffordability = pop.quotes
        .filter((q) => ["Los Angeles", "Alpine"].includes(q.countyName))
        .map((q) => {
          const units = Math.max(
            0.25,
            (q.population / pop.medianProjectedDistrictPopulation) * (q.districts > 1 ? 0.6 : 1)
          );
          if (quoteTimelineAction(2, 0, 8, units, true) !== q.initialQuotePs)
            throw new Error("Population and rules quote differ");
          return {
            county: q.countyName,
            initialReferenceQuotePs: q.initialQuotePs,
            localCaRows: caOrgs.length,
            affordableAtCurrentPressure: caOrgs.filter(
              (o) =>
                (o.politicalStrength ?? 0) >=
                quoteTimelineAction(2, pressureByKey.get(orgKey(o)) ?? 0, 8, units, true)
            ).length,
            caveat:
              "2027 reference quote compared with a possibly different-preset local budget; not an installed resident quote",
          };
        });
    }
    const populationByState = new Map<string, number>();
    for (const county of counties) {
      if (!Number.isSafeInteger(county.population) || county.population < 0)
        throw new Error("Invalid county stock");
      populationByState.set(
        county.stateId,
        (populationByState.get(county.stateId) ?? 0) + county.population
      );
    }
    const after = await db
      .collection<World>("gameState")
      .findOne({ _id: "current" }, { projection: worldProjection, maxTimeMS: 5000 });
    const stable =
      before.currentTurn === after?.currentTurn && before.worldEpochId === after?.worldEpochId;
    const nonRead = Object.keys(commands).filter(
      (name) => !["find", "getMore", "killCursors", "aggregate", "endSessions"].includes(name)
    );
    if (nonRead.length) throw new Error("Unexpected command in read-only collector");
    const report = {
      schema: "us-geographic-local-qualification-v1",
      observedAt: now.toISOString(),
      targetKey: key,
      evidenceClass: key === "MONGODB_URI" ? "user-selected-local-world" : "live-world",
      world: {
        preset: before.preset,
        turnBefore: turn,
        turnAfter: after?.currentTurn,
        sameObservedTurnAndEpoch: stable,
      },
      consistency:
        "Projected read-only observations, not an atomic cross-collection snapshot; stable turn does not prove absence of concurrent writes.",
      population: {
        regions: regions.length,
        votingStates: votingStates.size,
        counties: counties.length,
        missingCountyStates: regions
          .filter((r) => !populationByState.has(r._id))
          .map((r) => r._id)
          .sort(),
        mismatchedCountyStateTotals: regions
          .filter(
            (r) => populationByState.has(r._id) && populationByState.get(r._id) !== r.population
          )
          .map((r) => r._id)
          .sort(),
      },
      budgets: {
        allUsStateRows: orgs.length,
        votingStateRows: relevant.length,
        all: budget(relevant),
        activePlayerMember: budget(relevant.filter((o) => memberKeys.has(orgKey(o)))),
        noActivePlayerMember: budget(relevant.filter((o) => !memberKeys.has(orgKey(o)))),
        pressure: summary(relevant.map((o) => pressureByKey.get(orgKey(o)) ?? 0)),
      },
      positions: {
        rows: positions.length,
        known: positions.filter((p) => Number.isFinite(p.economicPosition)).length,
        greyBand: positions.filter(
          (p) => Number.isFinite(p.economicPosition) && Math.abs(p.economicPosition) < 1
        ).length,
      },
      ledger,
      ledgerCaveat:
        "A ledger stateId is geography, not proof of the debited pool. National-targeted and state spending may share it; no state-only opportunity cost is inferred.",
      referenceCountyAffordability,
      limitations: [
        "Local observations do not qualify production budgets or the unobserved 2027 world.",
        "No identities, account dates, raw documents or connection values are exported.",
        "No current county stocks means resident pricing cannot be qualified against this world until its lifecycle is initialized.",
      ],
      commandCounts: commands,
      implementationSha256: createHash("sha256")
        .update(readFileSync("scripts/ops/usCountyPoliticalQualification.ts"))
        .digest("hex"),
    };
    writeFileSync(resolve(out), JSON.stringify(report, null, 2) + "\n");
    console.log(
      JSON.stringify({
        output: resolve(out),
        world: report.world,
        population: report.population,
        budgetRows: relevant.length,
        activePlayerMemberRows: report.budgets.activePlayerMember.reserves.count,
      })
    );
  } finally {
    await client.close();
  }
}
main().catch((error: unknown) => {
  console.error(
    `Read-only qualification failed (${error instanceof Error ? error.name : "unknown"}); connection and document details suppressed.`
  );
  process.exitCode = 1;
});
