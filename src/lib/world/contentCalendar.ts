/**
 * Year-by-year content calendar for the 2027 world.
 *
 * For each year and each full-simulation country it lists what the world can
 * put in front of that country: living-conflict families that can open, crisis
 * templates that can auto-spawn, player event (PREE) definitions, opportunities,
 * law types and researchable tech tiers. Built from static catalogues only, so
 * the same inputs always give the same report, and a test can assert that no
 * year runs dry in any category.
 *
 * "Eligible" means the content's own year window and country gating allow it.
 * Live conditions (metrics, tension, cooldowns, rolls) still decide whether it
 * fires, so an eligible item is a possibility, not a schedule.
 */
import type { CountryId } from "@/lib/constants/countries";
import { getResearchableDecades } from "@/lib/constants/techTree/decades";
import { countryAllowed } from "@/lib/crises/autoCrisisSpawn";
import { isTemplateAllowedInYear } from "@/lib/crises/crisisEraWindow";
import { isDisasterAllowedInCountry } from "@/lib/crises/selectDisasterTemplate";
import { ALL_CRISIS_TEMPLATES } from "@/lib/crises/templates";
import type { CrisisTemplate } from "@/lib/db/types/crisis";
import type { EventDefinition } from "@/lib/db/types/events";
import { PREE_SEED_DEFINITIONS } from "@/lib/events/pree/seedDefinitions";
import { isWithinYearWindow } from "@/lib/events/substrate/yearWindow";
import { allParticipants } from "@/lib/livingConflict/driver";
import { isFutureConflictFamily } from "@/lib/livingConflict/futureConflicts";
import { allLivingConflictDefs } from "@/lib/livingConflict/registry";
import { PACIFIC_STRAIT_KEY } from "@/lib/livingConflict/rules/futureConflicts";
import { calendarWindowOpen } from "@/lib/livingConflict/rules/openingWindow";
import { resolveConflictParticipants } from "@/lib/livingConflict/rules/participants";
import { PANDEMIC_KEY } from "@/lib/livingConflict/rules/pandemic";
import type { LivingConflictDef } from "@/lib/livingConflict/types";
import { matchesCountryLegislationType } from "@/lib/policy/nationalPolicyRecords";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import { countriesByTier, type ShippingPreset } from "@/lib/world/eraRoster";

export const CALENDAR_PRESET: ShippingPreset = "2027-default";
export const CALENDAR_FIRST_YEAR = 2027;
export const CALENDAR_LAST_YEAR = 2055;

export const CALENDAR_CATEGORIES = [
  "livingConflicts",
  "crisisTemplates",
  "preeEvents",
  "opportunities",
  "lawTypes",
  "researchTiers",
] as const;
export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];

export interface CalendarCell {
  year: number;
  countryId: CountryId;
  items: Record<CalendarCategory, string[]>;
}

/** Content whose own window names this year, as opposed to the open-ended pool. */
export interface DatedContent {
  year: number;
  items: Record<Exclude<CalendarCategory, "lawTypes" | "researchTiers">, string[]>;
}

export interface ContentCalendar {
  preset: ShippingPreset;
  firstYear: number;
  lastYear: number;
  countryIds: CountryId[];
  cells: CalendarCell[];
  dated: DatedContent[];
}

/** Countries the full simulation runs in the 2027 world. */
export function fullSimulationCountries(preset: ShippingPreset): CountryId[] {
  return [
    ...countriesByTier(preset, "player"),
    ...countriesByTier(preset, "econ"),
    ...countriesByTier(preset, "npp"),
  ];
}

function registeredCountries(preset: ShippingPreset): Set<string> {
  return new Set<string>([
    ...fullSimulationCountries(preset),
    ...countriesByTier(preset, "background"),
  ]);
}

function conflictWindowOpen(def: LivingConflictDef, year: number, preset: ShippingPreset): boolean {
  if (def.autoOpen === false) return false;
  if (calendarWindowOpen(def, year)) return true;
  return (def.presetOpeningWindows ?? []).some(
    (w) => w.preset === preset && year >= w.fromYear && year <= w.untilYear
  );
}

/** Whether a living conflict can involve the country at all. */
function conflictTouchesCountry(
  def: LivingConflictDef,
  countryId: string,
  registered: ReadonlySet<string>
): boolean {
  // Wave families and the pandemic pick their countries at run time from
  // every country with regional data.
  if (isFutureConflictFamily(def.key) && def.key !== PACIFIC_STRAIT_KEY) return true;
  if (def.key === PANDEMIC_KEY) return true;
  return allParticipants(resolveConflictParticipants(def, registered)).includes(countryId);
}

const autoSpawnable = (t: CrisisTemplate) => Boolean(t.autoTrigger || t.naturalDisaster);

function templateReachesCountry(t: CrisisTemplate, countryId: CountryId): boolean {
  if (t.naturalDisaster) return isDisasterAllowedInCountry(t, countryId);
  return countryAllowed(t, countryId);
}

function preeReachesCountry(d: PreeSeed, countryId: CountryId): boolean {
  if (d.kind.startsWith("worldEvents.")) return false;
  if (!d.broadcast && d.baseWeight <= 0) return false;
  return !d.requiresCountryIds || d.requiresCountryIds.includes(countryId);
}

type PreeSeed = Omit<EventDefinition, "_id" | "createdAt" | "updatedAt">;

const hasYearWindow = (o: { fromYear?: number; untilYear?: number }) =>
  o.fromYear !== undefined || o.untilYear !== undefined;
const preeHasYearWindow = (d: PreeSeed) => d.minYear !== undefined || d.maxYear !== undefined;

export function buildContentCalendar(
  options: {
    preset?: ShippingPreset;
    firstYear?: number;
    lastYear?: number;
  } = {}
): ContentCalendar {
  const preset = options.preset ?? CALENDAR_PRESET;
  const firstYear = options.firstYear ?? CALENDAR_FIRST_YEAR;
  const lastYear = options.lastYear ?? CALENDAR_LAST_YEAR;
  const countryIds = fullSimulationCountries(preset);
  const registered = registeredCountries(preset);
  const conflicts = allLivingConflictDefs();
  const templates = (Object.entries(ALL_CRISIS_TEMPLATES) as [string, CrisisTemplate][])
    .filter(([, t]) => autoSpawnable(t))
    .sort(([a], [b]) => a.localeCompare(b));
  const pree = [...PREE_SEED_DEFINITIONS].sort((a, b) => a.kind.localeCompare(b.kind));
  const lawsByCountry = new Map(
    countryIds.map((countryId) => [
      countryId,
      legislationTypes
        .filter((lt) => matchesCountryLegislationType(countryId, lt))
        .map((lt) => lt._id)
        .sort(),
    ])
  );

  const cells: CalendarCell[] = [];
  const dated: DatedContent[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const openConflicts = conflicts.filter((def) => conflictWindowOpen(def, year, preset));
    const openTemplates = templates.filter(([, t]) => isTemplateAllowedInYear(t, year));
    const openPree = pree.filter((d) => isWithinYearWindow(d, year));
    const research = getResearchableDecades(year).map((d) => d.id);

    dated.push({
      year,
      items: {
        livingConflicts: openConflicts
          .filter((def) => hasYearWindow(def) || (def.presetOpeningWindows ?? []).length > 0)
          .map((def) => def.key),
        crisisTemplates: openTemplates
          .filter(([, t]) => t.opportunity !== true && hasYearWindow(t))
          .map(([key]) => key),
        preeEvents: openPree
          .filter((d) => !d.kind.startsWith("worldEvents.") && preeHasYearWindow(d))
          .map((d) => d.kind),
        opportunities: openTemplates
          .filter(([, t]) => t.opportunity === true && hasYearWindow(t))
          .map(([key]) => key),
      },
    });

    for (const countryId of countryIds) {
      const reaching = openTemplates.filter(([, t]) => templateReachesCountry(t, countryId));
      cells.push({
        year,
        countryId,
        items: {
          livingConflicts: openConflicts
            .filter((def) => conflictTouchesCountry(def, countryId, registered))
            .map((def) => def.key),
          crisisTemplates: reaching.filter(([, t]) => t.opportunity !== true).map(([key]) => key),
          preeEvents: openPree.filter((d) => preeReachesCountry(d, countryId)).map((d) => d.kind),
          opportunities: reaching.filter(([, t]) => t.opportunity === true).map(([key]) => key),
          lawTypes: lawsByCountry.get(countryId) ?? [],
          researchTiers: research,
        },
      });
    }
  }
  return { preset, firstYear, lastYear, countryIds, cells, dated };
}

/** Every (year, country, category) with nothing eligible. Empty means no gaps. */
export function calendarGaps(
  calendar: ContentCalendar
): Array<{ year: number; countryId: CountryId; category: CalendarCategory }> {
  const gaps: Array<{ year: number; countryId: CountryId; category: CalendarCategory }> = [];
  for (const cell of calendar.cells) {
    for (const category of CALENDAR_CATEGORIES) {
      if (cell.items[category].length === 0) {
        gaps.push({ year: cell.year, countryId: cell.countryId, category });
      }
    }
  }
  return gaps;
}

const SHORT: Record<CalendarCategory, string> = {
  livingConflicts: "Conflicts",
  crisisTemplates: "Crises",
  preeEvents: "Events",
  opportunities: "Opportunities",
  lawTypes: "Laws",
  researchTiers: "Research",
};

/** Markdown rendering: a count table per year and country, then dated content. */
export function renderContentCalendarMarkdown(calendar: ContentCalendar): string {
  const lines: string[] = [];
  lines.push(`# Content calendar ${calendar.firstYear} to ${calendar.lastYear}`);
  lines.push("");
  lines.push(
    `Preset ${calendar.preset}. Full-simulation countries: ${calendar.countryIds.join(", ")}.`
  );
  lines.push("Counts are eligible items; live conditions still decide what fires.");
  lines.push("");
  lines.push(`| Year | Country | ${CALENDAR_CATEGORIES.map((c) => SHORT[c]).join(" | ")} |`);
  lines.push(`| --- | --- | ${CALENDAR_CATEGORIES.map(() => "---").join(" | ")} |`);
  for (const cell of calendar.cells) {
    const counts = CALENDAR_CATEGORIES.map((c) => String(cell.items[c].length));
    lines.push(`| ${cell.year} | ${cell.countryId} | ${counts.join(" | ")} |`);
  }
  lines.push("");
  lines.push("## Dated content by year");
  lines.push("");
  lines.push("Items whose own window includes the year. Open-ended pools are counted above.");
  for (const entry of calendar.dated) {
    lines.push("");
    lines.push(`### ${entry.year}`);
    for (const [category, keys] of Object.entries(entry.items) as [CalendarCategory, string[]][]) {
      lines.push(`- ${SHORT[category]}: ${keys.length > 0 ? keys.join(", ") : "none dated"}`);
    }
  }
  const gaps = calendarGaps(calendar);
  lines.push("");
  lines.push(`## Gaps: ${gaps.length}`);
  for (const gap of gaps) lines.push(`- ${gap.year} ${gap.countryId} ${SHORT[gap.category]}`);
  return lines.join("\n") + "\n";
}
