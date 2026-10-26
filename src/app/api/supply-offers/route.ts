import type { SupplyListing } from "@/lib/db/types/supplyListing";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { COMMODITY_TYPES } from "@/lib/constants/commodities";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import type { Corporation, GameConfig } from "@/lib/db/types";
import { loadOpenOffers, openOffersFilter } from "@/lib/corporations/supplyExchange/listingView";
import { OFFER_SORT_DIRS, OFFER_SORTS } from "@/lib/corporations/supplyExchange/offerOrdering";

const MAX_OFFERS = 60;
const privateHeaders = { "Cache-Control": "private, no-store" };
const querySchema = z.object({
  /** One commodity, or a comma list of them. */
  commodity: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean) : []))
    .pipe(z.array(z.enum(COMMODITY_TYPES)).max(COMMODITY_TYPES.length)),
  kind: z.enum(["player", "npp", "all"]).default("all"),
  side: z.enum(["buy", "sell"]).optional(),
  sort: z.enum(OFFER_SORTS).default("newest"),
  /** Defaults to the sort's natural direction: biggest, cheapest, newest, A to Z. */
  dir: z.enum(OFFER_SORT_DIRS).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_OFFERS).default(MAX_OFFERS),
});

/**
 * GET /api/supply-offers?commodity=&kind=&side=&sort=&dir=&page=&pageSize=: open
 * standing offers plus the corporations the viewer can take them with. Omit
 * `commodity` to list every commodity (the market hub); pass a comma list for
 * several. `kind` is player, npp or all (players first); `sort` is newest,
 * volume, premium or commodity (by name) and `dir` is asc or desc. `total`
 * counts the offers matching the filters and `totalAll` every open offer in
 * the commodity scope, so a list can say "12 of 40 offers". Read only; taking an offer goes through
 * the corporation's own take route.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const params = new URL(request.url).searchParams;
    const query = querySchema.safeParse({
      commodity: params.get("commodity") ?? undefined,
      kind: params.get("kind") ?? undefined,
      side: params.get("side") ?? undefined,
      sort: params.get("sort") ?? undefined,
      dir: params.get("dir") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    });
    if (!query.success) return errorResponse(400, "Invalid filter or paging");
    const db = await getDb();
    const config = await db
      .collection<GameConfig>("gameConfig")
      .findOne({ _id: "default" }, { projection: { supplyAgreementsEnabled: 1 } });
    if (!config?.supplyAgreementsEnabled) {
      return NextResponse.json(
        {
          enabled: false,
          offers: [],
          myCorporations: [],
          currentTurn: 0,
          page: 1,
          hasMore: false,
          total: 0,
          totalAll: 0,
        },
        { headers: privateHeaders }
      );
    }
    const [turn, mine] = await Promise.all([
      getCurrentTurn(db),
      ObjectId.isValid(auth.user.userId)
        ? db
            .collection<Corporation>("corporations")
            .find({ userId: new ObjectId(auth.user.userId), ceoVacant: { $ne: true } })
            .project<Pick<Corporation, "_id" | "name" | "countryId">>({
              name: 1,
              countryId: 1,
            })
            .limit(20)
            .toArray()
        : Promise.resolve([]),
    ]);
    const listings = db.collection<SupplyListing>("supplyListings");
    const [{ offers, hasMore }, total, totalAll] = await Promise.all([
      loadOpenOffers(db, {
        commodities: query.data.commodity,
        kind: query.data.kind,
        side: query.data.side,
        sort: query.data.sort,
        dir: query.data.dir,
        turn,
        viewerCorpIds: new Set(mine.map((c) => c._id.toString())),
        limit: query.data.pageSize,
        page: query.data.page,
      }),
      listings.countDocuments(
        openOffersFilter({
          commodities: query.data.commodity,
          kind: query.data.kind,
          side: query.data.side,
          turn,
        })
      ),
      query.data.kind === "all" && !query.data.side
        ? null
        : listings.countDocuments(openOffersFilter({ commodities: query.data.commodity, turn })),
    ]);
    return NextResponse.json(
      {
        enabled: true,
        offers,
        myCorporations: mine.map((c) => ({
          id: c._id.toString(),
          name: c.name,
          countryId: c.countryId,
        })),
        currentTurn: turn,
        page: query.data.page,
        hasMore,
        total,
        totalAll: totalAll ?? total,
      },
      { headers: privateHeaders }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
