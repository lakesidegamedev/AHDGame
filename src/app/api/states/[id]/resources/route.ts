// GET — state resource capacity + active contracts + current extraction output
// Public read — used by state page Resources tab

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { handleRouteError, badRequest } from "@/lib/api/errors";
import { EXTRACTABLE_RESOURCES } from "@/lib/constants/commodities";
import type { ExtractableResource } from "@/lib/constants/commodities";
import type { StateResourceCapacity } from "@/lib/db/types/stateResourceCapacity";
import type { ExtractionContract } from "@/lib/db/types/extractionContract";
import { activeExtractionContractFilter } from "@/lib/db/collections/extractionContracts";
import type { CommodityPrice } from "@/lib/db/types/commodityPrice";
import type { Corporation } from "@/lib/db/types/corporation";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import { isProspectingEnabled, isContractIssuanceEnabled } from "@/lib/extraction/featureFlag";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: stateId } = await params;
    const countryId = new URL(request.url).searchParams.get("countryId");
    if (countryId && !Object.hasOwn(COUNTRY_CONFIGS, countryId))
      throw badRequest("Invalid countryId");
    const scope = { stateId, ...(countryId ? { countryId: countryId as CountryId } : {}) };
    const db = await getDb();

    const stateSupplyKey = `stateSupply.${stateId}` as const;

    // Read tender reservations before contracts so an award cannot disappear between reads.
    const reservations = await db
      .collection<import("@/lib/governmentContracts/types").GovernmentTender>("governmentTenders")
      .find(
        {
          "terms.type": "extraction",
          "terms.stateId": stateId,
          status: { $in: ["publishing", "open", "awarding"] },
          ...(countryId ? { countryId: countryId as CountryId } : {}),
        },
        { projection: { _id: 1, terms: 1 } }
      )
      .toArray();
    const [capacityDoc, contracts, commodityPrices, config] = await Promise.all([
      db.collection<StateResourceCapacity>("stateResourceCapacity").findOne(scope),
      db
        .collection<ExtractionContract>("extractionContracts")
        .find({ ...scope, ...activeExtractionContractFilter() })
        .toArray(),
      db
        .collection<CommodityPrice>("commodityPrices")
        .find(
          { commodity: { $in: [...EXTRACTABLE_RESOURCES] }, [stateSupplyKey]: { $exists: true } },
          { projection: { commodity: 1, turn: 1, [stateSupplyKey]: 1 } }
        )
        .sort({ turn: -1 })
        .toArray(),
      db
        .collection<GameConfig>("gameConfig")
        .findOne(
          { _id: "default" },
          { projection: { prospectingEnabled: 1, contractIssuanceEnabled: 1 } }
        ),
    ]);

    const capacity = capacityDoc?.resources ?? {};

    const currentOutput: Partial<Record<ExtractableResource, number>> = {};
    for (const priceDoc of commodityPrices) {
      const resource = priceDoc.commodity as ExtractableResource;
      if (currentOutput[resource] !== undefined) continue;
      currentOutput[resource] = priceDoc.stateSupply?.[stateId] ?? 0;
    }

    const linkedTenders = new Set(contracts.map((c) => c.tenderId).filter(Boolean));
    const summary = EXTRACTABLE_RESOURCES.map((resource) => {
      const cap = capacity[resource] ?? 0;
      const resourceContracts = contracts.filter((c) => c.resource === resource);
      const contractedShare = resourceContracts.reduce((sum, c) => sum + (c.share ?? 0), 0);
      const reservedShare = reservations.reduce(
        (sum, tender) =>
          sum +
          (tender.terms.type === "extraction" &&
          tender.terms.resource === resource &&
          !linkedTenders.has(tender._id)
            ? tender.terms.share
            : 0),
        0
      );
      const committedShare = contractedShare + reservedShare;
      const openAccessPct = Math.max(0, 1 - contractedShare);
      return {
        resource,
        capacityPerTurn: cap,
        contractedPct: Math.min(1, contractedShare),
        openAccessPct,
        committedShare,
        overAllocated: contractedShare > 1,
        currentOutput: currentOutput[resource] ?? 0,
      };
    }).filter((r) => r.capacityPerTurn > 0 || r.currentOutput > 0);

    const corpIds = [...new Set(contracts.map((c) => c.corporationId as ObjectId))];
    const corporations =
      corpIds.length > 0
        ? await db
            .collection<Corporation>("corporations")
            .find({ _id: { $in: corpIds } }, { projection: { name: 1 } })
            .toArray()
        : [];
    const corpNames = new Map(corporations.map((c) => [c._id.toString(), c.name]));

    return NextResponse.json({
      stateId,
      // Per-surface flag convention: the Resources tab reads both gates off its
      // own payload (prospect + issue-contract actions for governors).
      prospectingEnabled: await isProspectingEnabled(config),
      contractIssuanceEnabled: await isContractIssuanceEnabled(config),
      summary,
      contracts: contracts.map((c) => {
        const id = (c.corporationId as ObjectId).toString();
        const { missedPayments: _missedPayments, ...publicContract } = c;
        return {
          ...publicContract,
          _id: c._id.toString(),
          corporationId: id,
          corporationName: corpNames.get(id),
        };
      }),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
