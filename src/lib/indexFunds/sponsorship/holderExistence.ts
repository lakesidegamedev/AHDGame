/**
 * Which fund positions' holder records still exist.
 *
 * A holder can be deleted after it bought in: a party merge culls NPPs
 * (`src/lib/parties/proposals.ts`), and nothing cascade-cleans the fund
 * positions that point at them. Paying such a position can never succeed, and
 * letting that abort wind-up strands the whole fund (mirrors the dividend
 * pass-through, which skips a holder whose NPP is gone).
 *
 * The check is batched: one $in read per holder collection for the whole
 * position list, never one read per position.
 */

import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { IndexFundHolderKind, IndexFundPosition } from "@/lib/db/types/indexFund";

type HolderIdField =
  "characterId" | "imperialCharacterId" | "corporationId" | "nppId" | "pensionSchemeId";

const HOLDER_LOOKUPS: Array<{
  kind: IndexFundHolderKind;
  collection: string;
  field: HolderIdField;
}> = [
  { kind: "character", collection: "characters", field: "characterId" },
  { kind: "imperial_character", collection: "imperialCharacters", field: "imperialCharacterId" },
  { kind: "corporation", collection: "corporations", field: "corporationId" },
  { kind: "npp", collection: "npps", field: "nppId" },
  { kind: "pension_scheme", collection: "pensionSchemes", field: "pensionSchemeId" },
];

/** Position ids whose holder document is provably absent. */
export async function findMissingFundHolders(
  db: Db,
  positions: IndexFundPosition[]
): Promise<Set<string>> {
  const missing = new Set<string>();
  for (const { kind, collection, field } of HOLDER_LOOKUPS) {
    // A position without its holder id is a malformed record, not a missing
    // holder, and still fails loudly in payFundHolderCash.
    const held = positions
      .filter((position) => position.holderKind === kind)
      .map((position) => ({ position, id: position[field] }))
      .filter((entry): entry is { position: IndexFundPosition; id: ObjectId } => Boolean(entry.id));
    if (held.length === 0) continue;
    const rows = await db
      .collection(collection)
      .find({ _id: { $in: held.map((entry) => entry.id) } }, { projection: { _id: 1 } })
      .toArray();
    const alive = new Set(rows.map((row) => String(row._id)));
    for (const { position, id } of held) {
      if (!alive.has(String(id))) missing.add(String(position._id));
    }
  }
  return missing;
}
