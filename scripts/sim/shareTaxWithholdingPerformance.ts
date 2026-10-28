/** Isolated projected-BSON and command-count qualification of the new batched reads. */
import assert from "node:assert/strict";
import { BSON, ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "../../src/lib/test-utils/inMemoryDb";
import { loadStockWithholdingContexts } from "../../src/lib/budget/stockSaleWithholding";

async function measure(players: number) {
  const memory = createInMemoryDb();
  const ids = Array.from({ length: players }, () => new ObjectId());
  memory.seed("gameState", [{ _id: "current", stockHoldingTaxStartTurn: 0, forexEnabled: true }]);
  memory.seed(
    "characters",
    ids.map((_id) => ({
      _id,
      countryId: "US",
      homeState: "US_CA",
      incomeTier: "middle",
      incomeTaxStartTurn: 0,
      unusedBiography: "x".repeat(10000),
    }))
  );
  memory.seed("federalBudget", [
    { _id: "federal", countryId: "US", currencyCode: "USD", taxRates: { incomeTax: 20 } },
  ]);
  memory.seed("stateBudgets", [{ _id: "US_CA", countryId: "US", taxRates: { incomeTax: 5 } }]);
  memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  let commands = 0,
    bytes = 0;
  const project = (value: unknown, options: unknown) => {
    const projection = (options as { projection?: Record<string, number> } | undefined)?.projection;
    if (!projection || !value || typeof value !== "object") return value;
    const pick = (row: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(row).filter(([key]) =>
          key === "_id" ? projection._id !== 0 : projection[key] === 1
        )
      );
    return Array.isArray(value)
      ? value.map((row) => pick(row))
      : pick(value as Record<string, unknown>);
  };
  const measureResult = (value: unknown) => {
    commands++;
    if (value !== null) bytes += BSON.calculateObjectSize({ value });
    return value;
  };
  const db = {
    collection(name: string) {
      const collection = memory.collection(name);
      return new Proxy(collection, {
        get(target, prop) {
          const method = Reflect.get(target, prop);
          if (prop === "findOne")
            return async (...args: unknown[]) =>
              measureResult(project(await Reflect.apply(method, target, args), args[1]));
          if (prop === "find")
            return (...args: unknown[]) => {
              const cursor = Reflect.apply(method, target, args) as {
                toArray: () => Promise<unknown[]>;
              };
              return {
                toArray: async () => measureResult(project(await cursor.toArray(), args[1])),
              };
            };
          return typeof method === "function" ? method.bind(target) : method;
        },
      });
    },
  } as unknown as Db;
  const contexts = await loadStockWithholdingContexts(
    db,
    ids.map((id) => ({ id, collection: "characters" })),
    1
  );
  assert.equal(contexts.size, players);
  assert.equal(commands, 6);
  assert(bytes < players * 1000 + 2000, "Unneeded character fields leaked into projected reads");
  return {
    players,
    incrementalCommandsBefore: 0,
    incrementalCommandsAfter: commands,
    projectedDocumentBsonBytes: bytes,
  };
}
async function main() {
  const rows = [];
  for (const players of [1, 10, 100, 1000]) rows.push(await measure(players));
  console.log(
    JSON.stringify(
      {
        scope:
          "Only the new withholding-context load. In-memory driver boundary with requested projections applied explicitly for BSON estimates; not whole-world turn latency.",
        rows,
      },
      null,
      2
    )
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
