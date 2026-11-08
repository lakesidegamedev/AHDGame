/**
 * Batch manifesto read for the elections page.
 *
 * GET /api/country/[code]/elections/manifestos?electionIds=<id>,<id>,…
 *   → { catalog, pledgeCount, isPartyLeader, party, manifestos } where
 *     `manifestos` is keyed by election id, `null` where the caller's party has
 *     not written one.
 *
 * The page renders one ManifestoFlavorBar per contested race, and each used to
 * fetch its own manifesto and repeat the session/party lookups plus the
 * identical `catalog`/`party`/`isPartyLeader`. This answers the whole page in
 * two queries. The per-election route stays for POST (save/lock).
 */
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireHumanSessionWithCharacter } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { withNoStore } from "@/lib/api/withNoStore";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { PoliticalParty } from "@/lib/db/types";
import { pledgeCatalogFor } from "@/lib/countries/uk/manifesto/pledgeCatalog";
import { getManifestosForElections } from "@/lib/db/collections/manifestos";
import { MANIFESTO_PLEDGE_COUNT, MAX_MANIFESTO_ELECTION_IDS } from "@/lib/db/types/manifesto";

// withNoStore: the body is per-user (your party, your pledges). The header also
// carries `no-transform`, which stops Cloudflare re-compressing the JSON with
// zstd — an encoding some Android System WebView builds cannot decode, which
// surfaces to the client fetch() as a thrown "Network error" and would make the
// manifesto bars vanish on exactly those devices.
export const GET = withNoStore(
  async (request: Request, { params }: { params: Promise<{ code: string }> }) => {
    try {
      const { code } = await params;
      const countryId = code.toUpperCase() as CountryId;
      if (!COUNTRY_CONFIGS[countryId]) {
        return errorResponse(400, "Invalid country");
      }
      if (countryId !== "UK") {
        return errorResponse(400, "Manifestos are UK-only");
      }

      const raw = new URL(request.url).searchParams.get("electionIds");
      if (!raw) {
        return errorResponse(400, "electionIds is required");
      }
      const requested = raw.split(",").filter(Boolean);
      if (requested.length === 0) {
        return errorResponse(400, "electionIds is required");
      }
      if (requested.length > MAX_MANIFESTO_ELECTION_IDS) {
        return errorResponse(400, `At most ${MAX_MANIFESTO_ELECTION_IDS} elections per request`);
      }
      if (!requested.every((id) => ObjectId.isValid(id))) {
        return errorResponse(400, "Invalid electionId");
      }
      // De-duplicate, and remember each id's canonical (lowercase) form against
      // the caller's own spelling. `ObjectId.isValid` accepts uppercase hex,
      // which round-trips to a different string, so replying with
      // `String(row.electionId)` would leave the caller's key null and add one
      // it never asked for. Every key we answer with is a key we were given.
      const originalByCanonical = new Map<string, string>();
      for (const id of requested) originalByCanonical.set(id.toLowerCase(), id);
      const ids = [...originalByCanonical.values()];

      const auth = await requireHumanSessionWithCharacter(request);
      if (!auth.ok) return auth.response;

      const db = await getDb();
      const party = await db
        .collection<PoliticalParty>("politicalParties")
        .findOne({ countryId, chairId: auth.user.character._id });

      const catalog = pledgeCatalogFor(countryId).map((e) => ({
        id: e.id,
        label: e.label,
        blurb: e.blurb,
        policyDomain: e.policyDomain,
      }));

      // Every requested election gets a key, so the client can tell "no manifesto
      // yet" from "not asked for". A non-leader has none by definition, and the
      // manifestos collection is not touched at all.
      const manifestos: Record<string, ManifestoView | null> = Object.fromEntries(
        ids.map((id) => [id, null])
      );

      if (party) {
        const rows = await getManifestosForElections(
          db,
          countryId,
          ids.map((id) => new ObjectId(id)),
          String(party.sequentialId)
        );
        for (const row of rows) {
          const canonical = String(row.electionId).toLowerCase();
          const key = originalByCanonical.get(canonical) ?? canonical;
          manifestos[key] = {
            // A row missing its pledges used to break one bar; batching would
            // make it 500 the whole page, so degrade to "no pledges" instead.
            pledges: (row.pledges ?? []).map((p) => p.catalogEntryId),
            locked: Boolean(row.lockedAt),
            lockedAt: row.lockedAt ? new Date(row.lockedAt).toISOString() : null,
          };
        }
      }

      return NextResponse.json({
        catalog,
        pledgeCount: MANIFESTO_PLEDGE_COUNT,
        isPartyLeader: Boolean(party),
        party: party ? { id: String(party.sequentialId), name: party.name } : null,
        manifestos,
      });
    } catch (err) {
      return handleRouteError(err);
    }
  }
);

interface ManifestoView {
  pledges: string[];
  locked: boolean;
  lockedAt: string | null;
}
