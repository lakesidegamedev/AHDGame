import { z } from "zod";
import type { CmLinkFilter } from "./links";

/** Deep-link params parsing for the Campaign Manager page (server side). */

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const raceSchema = z.string().regex(/^[a-f0-9]{24}(:[\w-]{1,32})?$/i);
const typeSchema = z.string().regex(/^[A-Za-z][\w]{0,47}$/);
const stageSchema = z.enum(["all", "primary", "general", "final"]);
const regionSchema = z.string().regex(/^[A-Z]{2,3}$/);
const yearSchema = z.coerce.number().int().min(1700).max(2300);
const partySchema = z.string().regex(/^[\w-]{1,32}$/);

/** The link's race and filter, each param kept only when it is well formed. */
export function parseCampaignManagerParams(sp: Record<string, string | string[] | undefined>): {
  race: string | null;
  filter: Partial<CmLinkFilter>;
} {
  const pick = <T>(schema: z.ZodType<T>, v: string | undefined): T | undefined => {
    if (v === undefined) return undefined;
    const r = schema.safeParse(v);
    return r.success ? r.data : undefined;
  };
  const filter: Partial<CmLinkFilter> = {};
  const type = pick(typeSchema, one(sp.type));
  if (type) filter.type = type;
  const stage = pick(stageSchema, one(sp.stage));
  if (stage) filter.stage = stage;
  const region = pick(regionSchema, one(sp.region)?.toUpperCase());
  if (region) filter.regionId = region;
  const year = pick(yearSchema, one(sp.year));
  if (year !== undefined) filter.year = year;
  const party = pick(partySchema, one(sp.party));
  if (party) filter.party = party;
  return { race: pick(raceSchema, one(sp.race)) ?? null, filter };
}
