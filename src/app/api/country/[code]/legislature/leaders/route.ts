/**
 * GET /api/country/[code]/legislature/leaders — Legislature leadership by country.
 *
 * Consolidates the former per-country routes:
 *   /api/legislature/uk/leaders, /api/legislature/ca/leaders, /api/legislature/de/leaders
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { COUNTRY_CONFIGS, isParliamentarySystem, type CountryId } from "@/lib/constants/countries";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import type { ParliamentaryGovernment, PoliticalParty } from "@/lib/db/types";
import {
  resolveGoverningPartyIdsFromDocuments,
  resolveOppositionLeader,
} from "@/lib/turn/parliamentaryGovernment";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { parliamentaryGovernmentsCollection } from "@/lib/db/repositories/parliamentaryGovernments";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const countryId = code.toUpperCase() as CountryId;
    const config = COUNTRY_CONFIGS[countryId];
    if (!config) {
      return errorResponse(404, "Invalid country code");
    }

    const db = await getDb();

    // Determine the head-of-government office type from country config
    const executiveOffice = config.officeTypes.find((o) => o.isExecutive);
    const executiveKey = executiveOffice?.key ?? "primeMinister";

    // governmentFormations is canonical for parliamentary systems; parliamentaryGovernments
    // is legacy and is not refreshed after a Commons general election, so it can sit empty
    // while governmentFormations still has the correct PM/seatsByParty.
    const [govFormation, govDoc] = await Promise.all([
      getGovernmentFormationsCollection(db).findOne({ _id: countryId }),
      parliamentaryGovernmentsCollection(db).findOne({ _id: countryId }),
    ]);

    // governmentFormations is authoritative for parliamentary head-of-government
    // identity. Reading currentOffice first lets a stale office projection
    // disagree with the executive page, which reads pmCharacterId. Preserve a
    // present null as an intentional vacancy instead of falling through to a
    // legacy document or stale currentOffice projection.
    const formationHasPmField =
      govFormation !== null && Object.prototype.hasOwnProperty.call(govFormation, "pmCharacterId");
    const pmCharacterId = formationHasPmField
      ? (govFormation?.pmCharacterId ?? null)
      : (govDoc?.pmCharacterId ?? null);
    let hogChar = pmCharacterId
      ? await charactersCollection(db).findOne({ _id: pmCharacterId })
      : null;

    // Keep legacy and presidential callers working when there is no canonical
    // PM field to consult. A present, null pmCharacterId is an intentional
    // vacancy and must not be replaced by a stale currentOffice row.
    const noCanonicalPmField =
      !formationHasPmField &&
      (govDoc === null || !Object.prototype.hasOwnProperty.call(govDoc, "pmCharacterId"));
    if (!hogChar && (!isParliamentarySystem(config) || noCanonicalPmField)) {
      hogChar = await charactersCollection(db).findOne({
        countryId,
        "currentOffice.type": executiveKey,
      });
    }

    const hogNpp = govFormation?.pmNppId
      ? await nppsCollection(db).findOne(
          { _id: govFormation.pmNppId, countryId, retiredAt: null },
          { projection: { name: 1, party: 1, sequentialId: 1, avatarUrl: 1, updatedAt: 1 } }
        )
      : null;
    const hog = hogChar ?? hogNpp;
    let primeMinister = null;
    if (hog) {
      // Resolve party sequentialId to display name
      const partySeqId = hog.party ? Number.parseInt(hog.party, 10) : Number.NaN;
      let partyLabel: string | null = hog.party || null;
      if (!Number.isNaN(partySeqId)) {
        const partyDoc = await politicalPartiesCollection(db).findOne({
          sequentialId: partySeqId,
          countryId,
        });
        if (partyDoc) partyLabel = partyDoc.name;
      }

      primeMinister = {
        characterId: hogChar?._id.toString() ?? null,
        nppId: hogNpp?._id.toString() ?? null,
        isNPP: !hogChar,
        sequentialId: hog.sequentialId ?? null,
        characterName: hog.name,
        party: partyLabel,
        since: hog.updatedAt?.toISOString() || null,
        avatarUrl: hog.avatarUrl ?? null,
      };
    }

    // Find Opposition Leader. Prefer governmentFormations.seatsByParty (canonical) over
    // parliamentaryGovernments (legacy), which is cleared after a general election.
    // Uses the shared helper to consider both single parties and opposition coalitions.
    let oppositionLeader = null;
    const seatsByParty = govFormation?.seatsByParty ?? govDoc?.seatsByParty ?? null;

    if (seatsByParty) {
      const govPartyIds = await resolveGoverningPartyIdsFromDocuments(
        db,
        countryId,
        govFormation,
        govDoc
      );

      const partySeqNums = Object.keys(seatsByParty)
        .map((k) => Number.parseInt(k, 10))
        .filter((n) => !Number.isNaN(n));
      const partyDocs = partySeqNums.length
        ? await politicalPartiesCollection(db)
            .find({ countryId, sequentialId: { $in: partySeqNums } })
            .toArray()
        : [];
      const partyBySeq = new Map(partyDocs.map((p) => [String(p.sequentialId), p]));

      const result = await resolveOppositionLeader(
        db,
        countryId,
        seatsByParty,
        govPartyIds,
        partyBySeq
      );

      if (result) {
        const oppositionChar = result.chairId
          ? await charactersCollection(db).findOne({ _id: result.chairId })
          : null;
        const oppositionNpp = result.nppId
          ? await nppsCollection(db).findOne(
              { _id: result.nppId, countryId, retiredAt: null },
              { projection: { name: 1, party: 1, sequentialId: 1, avatarUrl: 1, updatedAt: 1 } }
            )
          : null;
        const opposition = oppositionChar ?? oppositionNpp;

        if (opposition) {
          oppositionLeader = {
            characterId: oppositionChar?._id.toString() ?? null,
            nppId: oppositionNpp?._id.toString() ?? null,
            isNPP: !oppositionChar,
            sequentialId: opposition.sequentialId ?? null,
            characterName: opposition.name,
            party: result.partyDoc?.name || opposition.party || null,
            since: opposition.updatedAt?.toISOString() || null,
            avatarUrl: opposition.avatarUrl ?? null,
          };
        }
      }
    }

    // Speaker is not yet implemented
    const speaker = null;

    return NextResponse.json({
      primeMinister,
      oppositionLeader,
      speaker,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
