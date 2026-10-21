/**
 * World headline for Market Adjustment: a wire post when several countries are
 * adjusting at once, and another when it eases. News only, no effects.
 * Opens at 3 or more countries with the event open, closes below 2 (so one
 * country flickering across the line does not repeat the headline).
 */
import type { Db } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import { createSystemNewsPost } from "@/lib/news";
import { MARKET_ADJUSTMENT_TEMPLATE_KEY } from "./template";
import { MARKET_ADJUSTMENT_SIGNALS } from "./signals";

export const HEADLINE_OPEN_AT = 3;
export const HEADLINE_CLOSE_BELOW = 2;
const WORLD_DOC_ID = "__worldHeadline";

/** Whether the headline should now be open, given whether it is and how many countries adjust. */
export function nextHeadlineState(wasOpen: boolean, countriesOpen: number): boolean {
  if (!wasOpen) return countriesOpen >= HEADLINE_OPEN_AT;
  return countriesOpen >= HEADLINE_CLOSE_BELOW;
}

export async function syncWorldHeadline(db: Db): Promise<"opened" | "closed" | null> {
  const crises = await db
    .collection<Crisis>("crises")
    .find(
      { templateKey: MARKET_ADJUSTMENT_TEMPLATE_KEY, status: "active" },
      { projection: { countryIds: 1 } }
    )
    .toArray();
  const countriesOpen = new Set(crises.flatMap((c) => c.countryIds ?? [])).size;
  const docs = db.collection<{ _id: string; headlineOpen?: boolean }>(MARKET_ADJUSTMENT_SIGNALS);
  const wasOpen = (await docs.findOne({ _id: WORLD_DOC_ID }))?.headlineOpen === true;
  const nowOpen = nextHeadlineState(wasOpen, countriesOpen);
  if (nowOpen === wasOpen) return null;
  // Atomic claim: only the run that flips the flag posts.
  const claim = await docs.updateOne(
    nowOpen
      ? { _id: WORLD_DOC_ID, headlineOpen: { $ne: true } }
      : { _id: WORLD_DOC_ID, headlineOpen: true },
    { $set: { headlineOpen: nowOpen } },
    { upsert: nowOpen }
  );
  if (claim.modifiedCount + claim.upsertedCount !== 1) return null;
  try {
    await createSystemNewsPost(
      nowOpen
        ? `Plants are losing money across ${countriesOpen} economies at once as the world adjusts to what buyers can pay for. Closures and retirements are spreading.`
        : "The wave of plant closures is easing as most economies move back to covering their costs.",
      "general",
      {
        title: nowOpen
          ? "Several Economies Adjust at Once"
          : "Market Adjustment Eases Across the World",
      }
    );
  } catch {
    // The wire is best-effort; the headline state above is the record.
  }
  return nowOpen ? "opened" : "closed";
}
