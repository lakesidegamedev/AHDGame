/**
 * Measures the query-level effect of the indexes and projections added by the
 * page-load PR, against the isolated benchmark clone of live data.
 *
 * Usage: node scripts/perf/page-load/measure-queries.mjs
 * (PROD-shaped clone on 127.0.0.1:27018, db ahd_sim_pageload_perf_20261022)
 */
import { MongoClient } from "mongodb";

const uri = "mongodb://127.0.0.1:27018/?directConnection=true";
const dbName = process.argv[2] ?? "ahd_sim_pageload_perf_20261022";
const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function timeIt(label, fn, runs = 20) {
  const times = [];
  let docs = 0;
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    const res = await fn();
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    docs = Array.isArray(res) ? res.length : (res?.length ?? 0);
  }
  const min = Math.min(...times);
  console.log(
    `${label.padEnd(52)} median=${median(times).toFixed(1).padStart(6)}ms min=${min
      .toFixed(1)
      .padStart(6)}ms docs=${docs}`
  );
  return median(times);
}

const dropIfExists = async (collection, name) => {
  try {
    await collection.dropIndex(name);
  } catch {
    /* absent */
  }
};

console.log(
  "electedOfficials: production already indexes state (eo_state) and officeType (eo_officeType); " +
    "no new index needed, so this script does not measure it."
);

const orders = db.collection("shareOrders");
const orderTotal = await orders.estimatedDocumentCount();
const corpSellQuery = { type: "sell", status: "open", placerCorporationId: { $exists: true } };
await dropIfExists(orders, "shareOrders_type_status_placerCorp");
console.log(`\nshareOrders docs=${orderTotal}`);
console.log("== before corporate-sell index ==");
const oScan = await orders
  .find(corpSellQuery)
  .explain("executionStats")
  .then((e) => e.executionStats);
console.log(
  `corp sell scan plan=${oScan.executionStages.stage} docsExamined=${oScan.totalDocsExamined} ms=${oScan.executionTimeMillis}`
);
await timeIt("subsidiary groups: open corporate sells (scan)", () =>
  orders.find(corpSellQuery).toArray()
);
await orders.createIndex(
  { type: 1, status: 1, placerCorporationId: 1 },
  { name: "shareOrders_type_status_placerCorp" }
);
console.log("== after corporate-sell index ==");
const oIx = await orders
  .find(corpSellQuery)
  .explain("executionStats")
  .then((e) => e.executionStats);
console.log(
  `corp sell index plan=${oIx.executionStages.stage} docsExamined=${oIx.totalDocsExamined} keysExamined=${oIx.totalKeysExamined} ms=${oIx.executionTimeMillis}`
);
await timeIt("subsidiary groups: open corporate sells (index)", () =>
  orders.find(corpSellQuery).toArray()
);

const characters = db.collection("characters");
const partyId = await characters.findOne(
  { party: { $exists: true }, countryId: "US" },
  { projection: { party: 1 } }
);
if (partyId?.party) {
  const q = { party: partyId.party, countryId: "US" };
  console.log(`\nparty roster (party=${partyId.party})`);
  await timeIt("party hub roster: full documents", () => characters.find(q).toArray());
  await timeIt("party hub roster: projected", () =>
    characters
      .find(q, {
        projection: {
          sequentialId: 1,
          name: 1,
          homeState: 1,
          currentOffice: 1,
          partyInfluence: 1,
          userId: 1,
          donorBaseLevel: 1,
          politicalInfluence: 1,
          countryId: 1,
          "policies.economic": 1,
          "policies.social": 1,
        },
      })
      .toArray()
  );
}

await client.close();
