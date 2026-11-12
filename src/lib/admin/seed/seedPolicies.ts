import type { Db } from "mongodb";
import { logWarning } from "@/lib/utils/errorLog";
import type { Policy } from "@/lib/db/types";
import { policies } from "@/lib/seeds/reference/policies";
import { policiesCollection } from "@/lib/db/repositories/policies";
import type { Document } from "mongodb";

export async function seedPolicies(db: Db, reset: boolean, log: (msg: string) => void) {
  if (reset)
    await policiesCollection<Document>(db)
      .drop()
      .catch((error) => {
        logWarning("Collection drop failed (may not exist)", {
          component: "AdminSeed",
          action: "drop collection",
          metadata: { error: String(error) },
        });
      });
  for (const policy of policies) {
    const { _id, ...policyData } = policy;
    await policiesCollection(db).updateOne({ _id }, { $set: policyData }, { upsert: true });
  }
  log(`Seeded ${policies.length} policies`);
}
