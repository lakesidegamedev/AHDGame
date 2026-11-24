import type { Db } from "mongodb";
import { wikiPagesCollection } from "@/lib/db/repositories/wikiPages";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";
import type { CountryId } from "@/lib/constants/countries";
import { legislatureUrl } from "@/lib/urls";
import { getEraContext } from "@/lib/era/context";
import { isLegislationTypeActive } from "@/lib/era/legislationCatalog";
import type { SearchResult } from "@/lib/search/types";

export interface SuggestionEntry {
  name: string;
  result: SearchResult;
}

/** Names a typo can be matched against when nothing in the results has the typed word in its title. */
export async function loadSuggestionVocabulary(
  db: Db,
  enabledCountries: string[] | undefined,
  canSeePrivate: boolean
): Promise<SuggestionEntry[]> {
  const wikiFilter: Record<string, unknown> = { status: "published" };
  if (!canSeePrivate) wikiFilter.private = { $ne: true };
  const countryFilter: Record<string, unknown> = enabledCountries
    ? { countryId: { $in: enabledCountries } }
    : {};

  const lawScopes = enabledCountries?.map((id) => id.toLowerCase());
  const lawFilter: Record<string, unknown> = lawScopes
    ? {
        $or: [
          { countryScope: { $in: lawScopes } },
          ...(lawScopes.includes("us") ? [{ countryScope: { $exists: false } }] : []),
        ],
      }
    : {};
  const [pages, corporations, npps, laws] = await Promise.all([
    wikiPagesCollection(db)
      .find(wikiFilter)
      .project<{ _id: { toString(): string }; title: string; slug: string; description?: string }>({
        title: 1,
        slug: 1,
        description: 1,
      })
      .limit(3000)
      .toArray(),
    corporationsCollection(db)
      .find(countryFilter)
      .project<{ _id: { toString(): string }; name: string; type?: string; sequentialId?: number }>(
        { name: 1, type: 1, sequentialId: 1 }
      )
      .limit(3000)
      .toArray(),
    nppsCollection(db)
      .find({ retiredAt: null, ...countryFilter })
      .project<{ _id: { toString(): string }; name: string; party?: string }>({
        name: 1,
        party: 1,
      })
      .limit(3000)
      .toArray(),
    legislationTypesCollection(db)
      .find(lawFilter)
      .project<{ _id: { toString(): string }; name: string; countryScope?: string }>({
        name: 1,
        countryScope: 1,
      })
      .limit(3000)
      .toArray(),
  ]);

  const { year } = await getEraContext(db);
  const activeLaws = laws.filter((law) => isLegislationTypeActive(law._id.toString(), year));
  const lawHref = (scope: string) =>
    scope === "us" ? "/congress" : legislatureUrl(scope.toUpperCase() as CountryId);
  return [
    ...activeLaws.map((law) => {
      const scope = String(law.countryScope ?? "us").toLowerCase();
      return {
        name: law.name,
        result: {
          type: "bill" as const,
          id: law._id.toString(),
          title: law.name,
          subtitle: "Proposable law · propose in the legislature",
          href: lawHref(scope),
        },
      };
    }),
    ...pages.map((p) => ({
      name: p.title,
      result: {
        type: "page" as const,
        id: p._id.toString(),
        title: p.title,
        subtitle: p.description || "Wiki page",
        href: `/wiki/${p.slug}`,
      },
    })),
    ...corporations.map((c) => ({
      name: c.name,
      result: {
        type: "corporation" as const,
        id: c._id.toString(),
        title: c.name,
        subtitle: c.type ?? "Corporation",
        href: `/corporation/${c.sequentialId ?? c._id.toString()}`,
      },
    })),
    ...npps.map((n) => ({
      name: n.name,
      result: {
        type: "politician" as const,
        id: n._id.toString(),
        title: n.name,
        subtitle: `${n.party ?? ""} · NPP`,
        href: `/politicians/npp/${n._id.toString()}`,
      },
    })),
  ];
}
