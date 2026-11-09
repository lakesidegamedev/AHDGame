import type { DemographicCategory } from "@/lib/db/types";
import { type CountryId } from "@/lib/constants/countriesCore";
import { LAYER1_DEMOGRAPHICS } from "@/lib/demographics/usDemographics";
import { DEMOGRAPHIC_LABELS as US_GROUP_LABELS } from "@/lib/seeds/demographicLabels";
import { ukDemographicCategories } from "@/lib/seeds/uk/ukDemographicCategories";
import { jpDemographicCategories } from "@/lib/countries/jp/data/jpDemographicCategories";
import { deDemographicCategories } from "@/lib/seeds/de/deDemographicCategories";
import { ieDemographicCategories } from "@/lib/seeds/ie/ieDemographicCategories";
import { cnDemographicCategories } from "@/lib/seeds/cn/cnDemographicCategories";
import { brDemographicCategories } from "@/lib/seeds/br/brDemographicCategories";
import { ddDemographicCategories } from "@/lib/seeds/dd/ddDemographicCategories";

export interface CanvassGroup {
  id: string;
  name: string;
  economicLean: number;
  socialLean: number;
}

export interface CanvassCategory {
  /** Modifier bucket key: "race"/"age"/… (US) or "<cc>_voterGroups". */
  key: string;
  /** Display label: "Race", "Age", … or "Voter Group". */
  label: string;
  groups: CanvassGroup[];
}

/** US Layer-1 category order (matches the historical canvassing/UI ordering). */
const US_CATEGORY_ORDER = ["race", "age", "education", "wealth", "ideology"] as const;

/** US ideology group labels — `seeds/demographicCategories` only labels the non-ideology dims. */
const US_IDEOLOGY_LABELS: Record<string, string> = {
  evangelicals: "Evangelicals",
  environmentalists: "Environmentalists",
  libertarians: "Libertarians",
  progressives: "Progressives",
  patriots: "Patriots",
  gunowners: "Gun Owners",
};

const US_CATEGORY_LABELS: Record<string, string> = {
  race: "Race",
  age: "Age",
  education: "Education",
  wealth: "Wealth",
  ideology: "Ideology",
};

/** Assemble the US categories from LAYER1_DEMOGRAPHICS + label maps. */
function buildUsCategories(): CanvassCategory[] {
  return US_CATEGORY_ORDER.map((category) => ({
    key: category,
    label: US_CATEGORY_LABELS[category],
    groups: LAYER1_DEMOGRAPHICS.filter((d) => d.category === category).map((d) => ({
      id: d.group,
      name: US_GROUP_LABELS[category]?.[d.group] ?? US_IDEOLOGY_LABELS[d.group] ?? d.group,
      economicLean: d.economicLean,
      socialLean: d.socialLean,
    })),
  }));
}

/** Normalize a country's seed DemographicCategory[] into CanvassCategory[]. */
function fromSeed(seed: DemographicCategory[]): CanvassCategory[] {
  return seed.map((cat) => ({
    key: cat._id,
    label: cat.groups.length > 0 ? "Voter Group" : cat.name,
    groups: cat.groups.map((g) => ({
      id: g.id,
      name: g.name,
      economicLean: g.defaultEconomicLean,
      socialLean: g.defaultSocialLean,
    })),
  }));
}

interface ProfileEntry {
  categories: CanvassCategory[];
}

/** Seeded canvassing categories by country; every other country uses the US Layer-1 set. */
const SEEDED_CATEGORIES: Partial<Record<CountryId, () => ProfileEntry>> = {
  UK: () => ({ categories: fromSeed(ukDemographicCategories) }),
  SCO: () => ({ categories: fromSeed(ukDemographicCategories) }),
  WAL: () => ({ categories: fromSeed(ukDemographicCategories) }),
  JP: () => ({ categories: fromSeed(jpDemographicCategories) }),
  DE: () => ({ categories: fromSeed(deDemographicCategories) }),
  IE: () => ({ categories: fromSeed(ieDemographicCategories) }),
  CN: () => ({ categories: fromSeed(cnDemographicCategories) }),
  BR: () => ({ categories: fromSeed(brDemographicCategories) }),
  DD: () => ({ categories: fromSeed(ddDemographicCategories) }),
};

function resolveProfile(countryId: string | undefined): ProfileEntry {
  const entry = countryId ? SEEDED_CATEGORIES[countryId.toUpperCase() as CountryId] : undefined;
  return entry ? entry() : { categories: buildUsCategories() };
}

/** Full category → group structure for a country (UI + validation). */
export function getDemographicCategoriesForCountry(
  countryId: string | undefined
): CanvassCategory[] {
  return resolveProfile(countryId).categories;
}

/** Validate a (category, group) pair for a country and return its leans + bucket key. */
export function resolveCanvassGroup(
  countryId: string | undefined,
  categoryKey: string,
  groupId: string
): { economicLean: number; socialLean: number; categoryKey: string } | null {
  const category = resolveProfile(countryId).categories.find((c) => c.key === categoryKey);
  const group = category?.groups.find((g) => g.id === groupId);
  if (!group) return null;
  return { economicLean: group.economicLean, socialLean: group.socialLean, categoryKey };
}

/** Countries whose canvassing categories are seeded explicitly. */
const CANVASS_COUNTRY_IDS = ["US", "UK", "JP", "DE", "IE", "CN", "BR", "DD"] as const;

/**
 * All valid demographic category keys across countries: US Layer-1 dimensions
 * plus each country's `<cc>_voterGroups`. Used to validate party GOTV target
 * categories without hardcoding.
 */
export function getAllDemographicCategoryKeys(): string[] {
  const seen = new Set<string>();
  for (const countryId of CANVASS_COUNTRY_IDS) {
    for (const category of getDemographicCategoriesForCountry(countryId)) {
      seen.add(category.key);
    }
  }
  return [...seen];
}
