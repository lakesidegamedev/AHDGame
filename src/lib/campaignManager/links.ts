import { z } from "zod";
import { isFinishedPrimary, type CmRace, type RaceFilter } from "./rules";

/**
 * Campaign Manager deep links: `race` opens one race (`electionId`, or
 * `electionId:partyId` for a party primary); `type`, `stage`, `region`, `year`
 * and `party` set the Find a Race filter. Plain data in and out, so server
 * pages, redirects and client links build and read the same URLs.
 */

export type CmLinkStage = RaceFilter["stage"];

export interface CmLinkParams {
  race?: string;
  type?: string;
  stage?: CmLinkStage;
  region?: string;
  year?: number;
  party?: string;
}

export interface CmLinkFilter {
  type: string;
  stage: CmLinkStage;
  regionId: string;
  year: number;
  party: string;
}

const PARAM_ORDER = ["race", "type", "stage", "region", "year", "party"] as const;

export function campaignManagerHref(p: CmLinkParams): string {
  const qs = PARAM_ORDER.filter((k) => p[k] !== undefined)
    .map((k) => `${k}=${encodeURIComponent(String(p[k]))}`)
    .join("&");
  return qs ? `/campaign-manager?${qs}` : "/campaign-manager";
}

/**
 * Where a "view this race" link goes: the presidency keeps its own page; every
 * other race opens in Campaign Manager, selected.
 */
export function raceHref(e: { id: string; electionType: string; seatId?: string | null }): string {
  if (e.electionType === "president") return `/elections/${e.seatId ?? e.id}`;
  return campaignManagerHref({ race: e.id });
}

/**
 * A link that names its race by id alone may point at the presidency, which
 * Campaign Manager does not show: the page sends it to the race's own page.
 */
export function presidentialRedirect(
  e: { _id: { toString(): string } | string; electionType: string; seatId?: string | null } | null
): string | null {
  if (!e || e.electionType !== "president") return null;
  return `/elections/${e.seatId ?? String(e._id)}`;
}

/** A party's primaries of one race type: the presidential primary page, else Campaign Manager. */
export function primaryTierHref(tier: string, partyId: string): string {
  if (tier === "president") return `/president/primary/${partyId}`;
  return campaignManagerHref({ type: tier, stage: "primary", party: partyId });
}

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

/**
 * The filter the page opens on before the player chooses one: the linked
 * race's type and region (a finished race on Finished at its year), else the
 * player's own race, else the first race type nationwide; link params win over
 * each of those. A link to a race the index does not hold (gone, presidential,
 * another country's) opens the same way as no link.
 */
export function openingFilter(
  races: CmRace[],
  pickedKey: string | null,
  initial: Partial<CmLinkFilter>
): Omit<RaceFilter, "regionNames"> | null {
  const linked = races.find((r) => r.key === pickedKey);
  const mine = races.find((r) => r.isMine && r.stage !== "final");
  const start = linked ?? mine ?? races[0];
  const type = initial.type ?? start?.electionType;
  if (!type) return null;
  const linkedFinal = linked && linked.stage === "final" && !isFinishedPrimary(linked);
  return {
    type,
    stage: initial.stage ?? (linkedFinal ? "final" : "all"),
    regionId: initial.regionId ?? (start && (linked || mine) ? start.regionId : "ALL"),
    query: "",
    year: initial.year ?? (linkedFinal ? linked.year : null),
    party: initial.party ?? null,
  };
}
