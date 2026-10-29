/** Fixed-state before/after proxy replay. This is not a forecast of whole-economy output. */
import { config } from "dotenv";
import { MongoClient } from "mongodb";
import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import {
  loadRecoverySnapshot,
  buildRecovery,
} from "../../src/lib/resetLegislation/recovery/runner";
import { loadMetricLawDelivery } from "../../src/lib/resetMetrics/loadLawDelivery";
import { loadResetPolicyPressure } from "../../src/lib/resetMetrics/loadPolicyPressure";
import { driftProxyValue } from "../../src/lib/resetMetrics/rules/policyDrift";
import { primaryMetricById } from "../../src/lib/resetMetrics/catalog";
import { resetMetricConditionScore } from "../../src/lib/resetMetrics/conditionScore";
async function main() {
  const { values } = parseArgs({
    options: {
      "env-file": { type: "string" },
      "uri-key": { type: "string", default: "MONGODB_URI" },
      out: { type: "string" },
    },
  });
  if (values["env-file"]) config({ path: values["env-file"], quiet: true });
  const uri = process.env[values["uri-key"]!];
  if (!uri || !values.out) throw new Error("Database key and private --out are required");
  const client = new MongoClient(uri, { directConnection: true, serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const db = client.db("a-house-divided");
    const snapshot = await loadRecoverySnapshot(db);
    const recovery = buildRecovery(snapshot);
    const before = await loadMetricLawDelivery(db, {
      worldId: recovery.worldId,
      turn: recovery.turn,
      regions: snapshot.boards.map((b) => ({ _id: b.regionId!, countryId: b.countryId })),
    });
    const applies = (p: { country: string; scope: string; regionId?: string; familyId: string }) =>
      recovery.programs.some(
        (r) =>
          r.country === p.country &&
          r.regionId === p.regionId &&
          r.scope === p.scope &&
          r.familyId === p.familyId
      );
    const after = {
      ...before,
      programs: [...before.programs.filter((p) => !applies(p)), ...recovery.programs],
      settlements: new Map(before.settlements),
    };
    for (const entry of recovery.receipts) after.settlements.set(entry.programId, entry.receipt);
    const scenarios = [];
    for (const renew of [false, true]) {
      const clone = (laws: typeof before) => ({
        ...laws,
        settlements: new Map(
          [...laws.settlements].map(([id, r]) => [
            id,
            renew ? { ...r, lastSettledTurn: recovery.turn, validThroughTurn: recovery.turn } : r,
          ])
        ),
      });
      const baseline = await loadResetPolicyPressure(db, {
        worldId: recovery.worldId,
        boards: snapshot.boards,
        turn: recovery.turn,
        laws: clone(before),
      });
      const migrated = await loadResetPolicyPressure(db, {
        worldId: recovery.worldId,
        boards: snapshot.boards,
        turn: recovery.turn,
        laws: clone(after),
      });
      const changes = [];
      for (const board of snapshot.boards)
        for (const [id, observed] of Object.entries(board.observations)) {
          if (
            observed.status !== "proxy" ||
            observed.definitionVersion === 2 ||
            !observed.source.match(/^(game outcome owner:|provisional continuity owner:)/) ||
            typeof observed.value !== "number" ||
            typeof board.openingValues?.[id] !== "number"
          )
            continue;
          const metric = primaryMetricById(id)!;
          let base = observed.value,
            updated = observed.value;
          for (let t = 0; t < 48; t++) {
            const common = {
              metric,
              openingValue: board.openingValues[id]!,
              countryId: board.countryId,
              year: snapshot.gs.currentYear ?? snapshot.gs.startingYear ?? 1991,
            };
            base = driftProxyValue({
              ...common,
              currentValue: base,
              pressure: baseline.get(board._id)?.[id] ?? 0,
            });
            updated = driftProxyValue({
              ...common,
              currentValue: updated,
              pressure: migrated.get(board._id)?.[id] ?? 0,
            });
          }
          const delta =
            (resetMetricConditionScore(
              metric,
              updated,
              board.countryId,
              snapshot.gs.currentYear ?? snapshot.gs.startingYear ?? 1991
            ) ?? 0) -
            (resetMetricConditionScore(
              metric,
              base,
              board.countryId,
              snapshot.gs.currentYear ?? snapshot.gs.startingYear ?? 1991
            ) ?? 0);
          if (!Number.isFinite(delta)) throw new Error("Replay produced a non-finite comparison");
          if (
            (baseline.get(board._id)?.[id] ?? 0) === (migrated.get(board._id)?.[id] ?? 0) &&
            Math.abs(delta) > 0.0001
          )
            throw new Error("Unchanged policy inputs changed the replay outcome");
          if (Math.abs(delta) > 0.0001)
            changes.push({
              country: board.countryId,
              region: board.regionId,
              metric: id,
              name: metric.name,
              before: base,
              after: updated,
              conditionDelta: delta,
            });
        }
      scenarios.push({
        name: renew
          ? "same recorded funded amounts renewed at next budget settlement"
          : "current receipt evidence held constant",
        horizon: 48,
        changes,
      });
    }
    const report = {
      question: "Recover recorded governor work without new money or overriding newer laws",
      turn: recovery.turn,
      hash: recovery.hash,
      programs: recovery.programs.length,
      catchUp: recovery.catchUp,
      scenarios,
      limits: [
        "Fixed economic and population inputs; only eligible fallback proxies replayed",
        "Renewal scenario is conditional on current appropriations being renewed, not evidence of past payments",
        "Measured owners and history were not written",
      ],
    };
    writeFileSync(values.out, JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify({
        turn: report.turn,
        programs: report.programs,
        catchUp: report.catchUp.length,
        scenarios: scenarios.map((s) => ({
          name: s.name,
          changed: s.changes.length,
          byCountry: ["US", "UK", "JP"].map((c) => ({
            country: c,
            metrics: s.changes.filter((x) => x.country === c).length,
            min: Math.min(
              0,
              ...s.changes.filter((x) => x.country === c).map((x) => x.conditionDelta)
            ),
            max: Math.max(
              0,
              ...s.changes.filter((x) => x.country === c).map((x) => x.conditionDelta)
            ),
          })),
        })),
        report: values.out,
      })
    );
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.name === "Error"
        ? error.message
        : error.name
      : "Simulation failed"
  );
  process.exitCode = 1;
});
