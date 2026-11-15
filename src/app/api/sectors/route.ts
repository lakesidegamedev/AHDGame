import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { handleRouteError } from "@/lib/api/errors";
import { OPERATING_SECTOR_TYPES, OPERATING_SECTOR_TYPE_LABELS, isOperatingSectorType, type OperatingSectorType } from "@/lib/constants/corporations";
import {
  COUNTRY_CONFIGS,
  COUNTRY_ORDER,
  getCountryDisplayName,
  type CountryId,
} from "@/lib/constants/countries";
import {
  fxRateForSectorHostFromMap,
  loadFxRatesByCurrency,
  resolveSectorHostCurrencyCode,
  type CorpCapitalCurrencyInfo,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { loadCountryPresentationOverrides } from "@/lib/country/countryIdentity";
import { loadWorldPreset } from "@/lib/currency/gdpAnchorRate";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { statesCollection } from "@/lib/db/repositories/states";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import type { Document } from "mongodb";

export type SectorView = "unowned" | "owned" | "forSale";
export type SectorSort = "revenue" | "type" | "state" | "country" | "margin" | "growth";

type SectorRow = {
  id: string;
  sectorType: OperatingSectorType;
  sectorTypeLabel: string;
  stateId: string;
  stateName: string;
  countryId: CountryId;
  countryName: string;
  countryFlag: string;
  owned: boolean;
  corporationId: string | null;
  corporationName: string | null;
  corporationSequentialId: number | null;
  corporationLogoUrl: string | null;
  revenue: number;
  revenueAnchor: number;
  margin: number | null;
  growthRate: number | null;
  workers: number | null;
  forSale: boolean;
  forSalePrice: number | null;
};

const PAGE_SIZE = 50;

// GET /api/sectors — Global sector listing with filters
// Query params:
//   view=owned|forSale (default: owned). view=unowned is accepted and returns an empty list.
//   type=<OperatingSectorType> (optional filter)
//   country=<CountryId> (optional filter)
//   sort=revenue|type|state|country|margin|growth (default: revenue)
//   dir=asc|desc (default: desc)
//   page=1
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sp = url.searchParams;

    // `unowned` once listed stored market cells. Nothing is stored any more, so
    // the request stays valid for older clients and answers with an empty list.
    const requestedView = sp.get("view");
    const view: SectorView =
      requestedView === "unowned" ? "unowned" : requestedView === "forSale" ? "forSale" : "owned";

    const requestedType = sp.get("type");
    const sectorTypeFilter = isOperatingSectorType(requestedType) ? requestedType : null;
    const countryFilter = sp.get("country") as CountryId | null;
    const sort: SectorSort = (sp.get("sort") as SectorSort) ?? "revenue";
    const dir = sp.get("dir") === "asc" ? "asc" : "desc";
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));

    const db = await getDb();

    // Load states for name resolution
    const states = await statesCollection(db)
      .find({})
      .project<{ _id: string; name: string; countryId: CountryId }>({
        _id: 1,
        name: 1,
        countryId: 1,
      })
      .toArray();
    const stateMap = new Map(states.map((s) => [s._id, s]));

    // A renamed country must be listed and labelled under the name it goes by.
    // Reunified Germany keeps `DD` as its id and carries the new name in
    // `countryState.displayNameOverride`, so reading the compiled config alone
    // showed sectors under "East Germany" while a stale "Germany" filter could
    // never match a row. `COUNTRY_ORDER` is the compiled roster, so narrow it to
    // countries that still hold territory.
    //
    // Three corrections: the runtime rename override, the era name (e.g. "Soviet
    // Union" for RU in 1953), and the flag override, which travels with the rename.
    //
    // Use `loadCountryPresentationOverrides` rather than
    // `resolveCountryIdentities`: the latter reads through `getCountryState`,
    // which self-heals a missing row, and this public listing endpoint must not
    // insert documents as a side effect.
    const [preset, overrides] = await Promise.all([
      loadWorldPreset(db),
      loadCountryPresentationOverrides(db),
    ]);
    const countriesWithStates = new Set(states.map((s) => s.countryId));

    // WHICH COUNTRY A SECTOR IS IN IS DECIDED BY ITS STATE, in one place, and the
    // row labels, the country filter and the tab badges all use it. They have to
    // agree: labelling a row from its state while filtering on its stored
    // `countryId` means a row whose stored value went stale when its region
    // changed hands is shown under one country and findable under another, or
    // under none at all once the filter list is narrowed to countries that hold
    // territory. Expressing the filter as `stateId in (that country's states)`
    // IS the state-first rule, and it stays a database query.
    const stateIdsByCountry = new Map<CountryId, string[]>();
    for (const s of states) {
      const list = stateIdsByCountry.get(s.countryId);
      if (list) list.push(s._id);
      else stateIdsByCountry.set(s.countryId, [s._id]);
    }
    const filteredStateIds =
      countryFilter && countryFilter in COUNTRY_CONFIGS
        ? (stateIdsByCountry.get(countryFilter) ?? [])
        : null;
    /** The country a row is in: its state's, then whatever it stored. */
    const hostCountryOf = (
      stateId: string,
      ...fallbacks: (string | null | undefined)[]
    ): CountryId => (stateMap.get(stateId)?.countryId ?? fallbacks.find(Boolean)) as CountryId;

    /**
     * The country filter, as a query. Used by the rows AND by the badge counts,
     * so the two cannot disagree.
     *
     * The second leg catches rows whose state was deleted but whose stored country
     * still labels them: without it they would be visible unfiltered but vanish
     * when filtered by the country they name.
     */
    const allStateIds = states.map((st) => st._id);
    const countryScopedFilter: Record<string, unknown> = filteredStateIds
      ? {
          $or: [
            { stateId: { $in: filteredStateIds } },
            { stateId: { $nin: allStateIds }, countryId: countryFilter },
          ],
        }
      : {};
    const countryNameOf = (id: CountryId): string =>
      overrides[id]?.name ?? getCountryDisplayName(id, preset);
    const countryFlagOf = (id: CountryId): string =>
      overrides[id]?.flagEmoji ?? COUNTRY_CONFIGS[id]?.flagEmoji ?? "";

    // Load FX rates for anchor normalization
    const fxByCurrency = await loadFxRatesByCurrency(db);

    const rows: SectorRow[] = [];

    if (view === "unowned") {
      // Retired view: no rows.
    } else {
      // Owned or forSale — query corporateSectors
      const corpFilter: Record<string, unknown> = {};
      if (sectorTypeFilter) Object.assign(corpFilter, { sectorType: sectorTypeFilter });
      Object.assign(corpFilter, countryScopedFilter);
      if (view === "forSale") {
        corpFilter.forSale = { $ne: null };
      }

      const ownedSectors = await corporateSectorsCollection(db)
        .find(corpFilter, {
          projection: {
            sectorType: 1,
            stateId: 1,
            countryId: 1,
            corporationId: 1,
            revenue: 1,
            profitMargin: 1,
            currentGrowthRate: 1,
            forSale: 1,
          },
        })
        .toArray();

      // Resolve corporations for name + currency
      const corpIds = [...new Set(ownedSectors.map((s) => s.corporationId.toString()))];
      const corpObjectIds = corpIds
        .filter((id) => ObjectId.isValid(id))
        .map((id) => new ObjectId(id));

      const corporations =
        corpObjectIds.length > 0
          ? await corporationsCollection(db)
              .find({ _id: { $in: corpObjectIds } })
              .project<
                {
                  _id: ObjectId;
                  name: string;
                  sequentialId?: number;
                  logoUrl?: string;
                } & CorpCapitalCurrencyInfo
              >({
                _id: 1,
                name: 1,
                sequentialId: 1,
                logoUrl: 1,
                countryId: 1,
                liquidCurrencyCode: 1,
              })
              .toArray()
          : [];

      const corpMap = new Map(corporations.map((c) => [c._id.toString(), c]));

      for (const s of ownedSectors) {
        const st = stateMap.get(s.stateId);
        const corp = corpMap.get(s.corporationId.toString());
        // STATE FIRST, matching `getSectorOperatingCountryId`, which is the
        // codebase's answer to this question everywhere else (hostile takeover,
        // the duplicate-sector repair). A sector row whose stored `countryId` is
        // stale after its region changed hands would otherwise be labelled under
        // a country that no longer holds it, and after the filter narrowing above
        // that country is not even offered as an option to find it under.
        const hostCountryId = hostCountryOf(s.stateId, s.countryId, corp?.countryId);
        const revenueAnchor = readCorpEconomicAnchor(
          s.revenue,
          resolveSectorHostCurrencyCode({ countryId: hostCountryId }, corp),
          fxRateForSectorHostFromMap({ countryId: hostCountryId }, corp, fxByCurrency)
        );

        rows.push({
          id: s._id.toString(),
          sectorType: s.sectorType,
          sectorTypeLabel: OPERATING_SECTOR_TYPE_LABELS[s.sectorType],
          stateId: s.stateId,
          stateName: st?.name ?? s.stateId,
          countryId: hostCountryId,
          countryName: countryNameOf(hostCountryId),
          countryFlag: countryFlagOf(hostCountryId),
          owned: true,
          corporationId: s.corporationId.toString(),
          corporationName: corp?.name ?? "Unknown",
          corporationSequentialId: corp?.sequentialId ?? null,
          corporationLogoUrl: corp?.logoUrl ?? null,
          revenue: Math.round(s.revenue),
          revenueAnchor: Math.round(revenueAnchor),
          margin: s.profitMargin ?? null,
          growthRate: s.currentGrowthRate ?? null,
          workers: null,
          forSale: !!s.forSale,
          forSalePrice: s.forSale?.priceAnchor ?? null,
        });
      }
    }

    // Sort
    const sign = dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sort) {
        case "type":
          return a.sectorTypeLabel.localeCompare(b.sectorTypeLabel) * sign;
        case "state":
          return a.stateName.localeCompare(b.stateName) * sign;
        case "country":
          return a.countryName.localeCompare(b.countryName) * sign;
        case "margin":
          return ((a.margin ?? 0) - (b.margin ?? 0)) * sign;
        case "growth":
          return ((a.growthRate ?? 0) - (b.growthRate ?? 0)) * sign;
        case "revenue":
        default:
          return (a.revenueAnchor - b.revenueAnchor) * sign;
      }
    });

    // Paginate
    const totalItems = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const clampedPage = Math.min(page, totalPages);
    const start = (clampedPage - 1) * PAGE_SIZE;
    const pageItems = rows.slice(start, start + PAGE_SIZE);

    // Summary counts for tab badges, on the same state-first basis the rows use.
    const corpCountFilter = { ...countryScopedFilter };

    const [ownedCount, forSaleCount] = await Promise.all([
      corporateSectorsCollection<Document>(db).countDocuments(corpCountFilter),
      corporateSectorsCollection<Document>(db).countDocuments({
        forSale: { $ne: null },
        ...corpCountFilter,
      }),
    ]);

    return NextResponse.json({
      view,
      ...(view === "unowned"
        ? {
            deprecated:
              "view=unowned is retired: markets are entered by building, so there is no unowned list. Use view=owned or view=forSale.",
          }
        : {}),
      sort,
      dir,
      page: clampedPage,
      totalPages,
      totalItems,
      sectors: pageItems,
      counts: {
        unowned: 0,
        owned: ownedCount,
        forSale: forSaleCount,
      },
      filters: {
        sectorTypes: OPERATING_SECTOR_TYPES.map((t) => ({
          value: t,
          label: OPERATING_SECTOR_TYPE_LABELS[t],
        })),
        // Curated order preserved: COUNTRY_ORDER is hand-ordered, not
        // alphabetical, so this filters and relabels without resequencing.
        countries: COUNTRY_ORDER.filter((id) => countriesWithStates.has(id)).map((id) => ({
          value: id,
          label: countryNameOf(id),
          flag: countryFlagOf(id),
        })),
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
