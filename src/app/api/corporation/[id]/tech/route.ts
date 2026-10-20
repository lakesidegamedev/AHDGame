/**
 * GET /api/corporation/[id]/tech — read model for the branching Tech tab (v2).
 *
 * Returns each decade's two lanes (Corporate / Sector) with per-node state
 * (owned, lane-locked, affordable in rd + cash, auto-granted, unlocked method),
 * the committed lane, tier art, and the corp's rd/cash wallet. For private corps
 * the picks + wallet are redacted for non-CEO viewers (tree definition stays).
 * When the gate is off, `enabled: false` and the tab hides itself.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { handleRouteError } from "@/lib/api/errors";
import { resolveCorporation } from "@/lib/api/corporations/resolveQuery";
import { getGameState } from "@/lib/gameState";
import { getAuthUser } from "@/lib/auth";
import type { Corporation } from "@/lib/db/types";
import { shouldRedactCorporation } from "@/lib/corporations/redaction";
import { getControllingCorporateParent } from "@/lib/corporations/corporateOwnership";
import { isSectorTechTreesEnabled } from "@/lib/corporations/techTree/featureFlag";
import {
  OPERATING_SECTOR_TYPE_LABELS,
  RD_INNOVATION_INTERVAL,
  RD_INNOVATION_SCORE_THRESHOLD,
} from "@/lib/constants/corporations";
import { calculateCorpStrengthProjection } from "@/lib/corporations/strengthProjection";
import { getCorpFxRate } from "@/lib/currency/corporationCapital";
import { SECTOR_STRATEGIES, getOperatingSectorType } from "@/lib/constants/sectorStrategies";
import {
  TECH_DECADES,
  TECH_TREE,
  isDecadeReached,
  getDecadeForYear,
  getDecadeLaneNodes,
  getCommittedLane,
  getNodePrereqIds,
  getExclusiveRivalIds,
  getPassedDecadeIds,
  getUnlockedStrategyIds,
  isNodeOpenForResearch,
  getSectorTechEffects,
  SLOT_PARENT,
  techNodeCashCost,
  techNodeValuePerTurn,
  type TechPlantBasis,
  tierImageUrl,
  describeTechEffect,
  techEffectCategory,
  TECH_INPUT_EFFICIENCY_CAP,
  TECH_PLANT_OUTPUT_CAP,
  TECH_NODE_CASH_REVENUE_FRACTION,
  type TechCorpView,
  type TechLane,
} from "@/lib/constants/techTree";
import { STARTING_YEAR, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { corpDailyGrossRevenuePricingLocal } from "@/lib/corporations/dailyGrossRevenue";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = await getDb();

    const gameState = await getGameState();
    if (!(await isSectorTechTreesEnabled(gameState ?? undefined))) {
      return NextResponse.json({ enabled: false });
    }

    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    const { corporation } = resolved;

    const authUser = await getAuthUser().catch(() => null);
    const isCeo =
      !corporation.ceoVacant &&
      !!authUser?.userId &&
      corporation.userId?.toString() === authUser.userId;
    // The CEO of the controlling parent is an insider of a private subsidiary,
    // the same rule the corporation page and sector detail apply. This only
    // lifts the read redaction: `isCeo` stays false, so unlock/abandon actions
    // remain with the subsidiary's own CEO.
    let viewerIsControllingParentCeo = false;
    const controllingParent =
      authUser?.userId && !isCeo ? getControllingCorporateParent(corporation) : null;
    if (authUser?.userId && controllingParent) {
      const parentCorp = await db
        .collection<Corporation>("corporations")
        .findOne(
          { _id: controllingParent.corporationId },
          { projection: { userId: 1, ceoVacant: 1 } }
        );
      viewerIsControllingParentCeo =
        !!parentCorp &&
        parentCorp.ceoVacant !== true &&
        parentCorp.userId?.toString() === authUser.userId;
    }
    const redact =
      !viewerIsControllingParentCeo &&
      shouldRedactCorporation(
        corporation,
        authUser?.userId ?? undefined,
        authUser?.isAdmin === true
      );

    const currentTurn = gameState?.currentTurn ?? 1;
    const startingYear = gameState?.startingYear ?? STARTING_YEAR;
    const currentYear =
      gameState?.currentYear ?? startingYear + Math.floor((currentTurn - 1) / TURNS_PER_YEAR);
    const operatingSectorType = getOperatingSectorType(
      corporation.type,
      corporation.industryModel
    ) as Corporation["type"];

    const corpView: TechCorpView = {
      type: corporation.type,
      industryModel: corporation.industryModel,
      unlockedTechNodeIds: corporation.unlockedTechNodeIds,
      techDecadeLane: corporation.techDecadeLane,
    };
    const unlocked = new Set(corporation.unlockedTechNodeIds ?? []);
    const passedDecades = new Set(getPassedDecadeIds(currentYear));
    const strategyNameById = new Map(
      (SECTOR_STRATEGIES[operatingSectorType] ?? []).map((s) => [s.id, s.name])
    );

    // Daily gross revenue → per-node cash cost. Null when redacted.
    let dailyGrossRevenue: number | null = null;
    let capacityFloorApplied = false;
    let techCashFloorLocal = 0;
    let techPlantBasis: TechPlantBasis | null = null;
    if (!redact) {
      // Ticket #1118: one helper for both the quoted price and the charged
      // price, and it converts each sector out of its host currency before
      // summing. The old inline reduce added yen straight into dollars.
      const pricing = await corpDailyGrossRevenuePricingLocal(db, corporation);
      dailyGrossRevenue = pricing.dailyGrossRevenueLocal;
      capacityFloorApplied = pricing.capacityFloorApplied;
      techCashFloorLocal = pricing.techCashFloorLocal;
      techPlantBasis = pricing.techPlantBasis;
    }
    const rdScore = redact ? null : Math.floor(corporation.rdScore ?? 0);
    const liquidCapital = redact ? null : Math.floor(corporation.liquidCapital ?? 0);

    const buildLane = (
      decadeId: string,
      reached: boolean,
      committed: TechLane | undefined,
      lane: TechLane
    ) => {
      const isPastDecade = passedDecades.has(decadeId);
      return getDecadeLaneNodes(operatingSectorType, decadeId, lane).map((node) => {
        const owned = unlocked.has(node.id);
        const cashCost = techNodeCashCost(
          node,
          dailyGrossRevenue ?? 0,
          techCashFloorLocal,
          techPlantBasis
        );
        // What the node is worth per turn to this corp, and how long its cash
        // price takes to earn back. Null when redacted or when the node has no
        // running plant value.
        const valuePerTurn = techPlantBasis ? techNodeValuePerTurn(node, techPlantBasis) : 0;
        const paybackTurns = valuePerTurn > 0 ? Math.ceil(cashCost / valuePerTurn) : null;
        // Past decades have both lanes auto-granted — no lane commitment applies.
        const laneLocked = isPastDecade ? false : !!committed && committed !== lane;
        // A completed decade grants only its baseline, so its specialization
        // tier is closed on both tracks (ticket 1606).
        const tierOpen = isNodeOpenForResearch(node, isPastDecade);
        const prereqIds = getNodePrereqIds(node);
        const prereqMet = prereqIds.length === 0 || prereqIds.some((id) => unlocked.has(id));
        // v3: owning a rival specialization locks this node for the decade.
        const pathLocked = getExclusiveRivalIds(operatingSectorType, node).some((id) =>
          unlocked.has(id)
        );
        const strategyEffect = node.effects.find((e) => e.kind === "unlockStrategy");
        return {
          id: node.id,
          name: node.name,
          description: node.description,
          slot: node.slot,
          parentSlot: SLOT_PARENT[node.slot] ?? null,
          prereqSlots: prereqIds.map((id) => Number(id.replace(/^.*-(\d+)$/, "$1"))),
          exclusiveGroup: node.exclusiveGroup ?? null,
          cost: node.cost,
          cashCost: redact ? null : cashCost,
          valuePerTurn: redact || valuePerTurn <= 0 ? null : Math.round(valuePerTurn),
          paybackTurns: redact ? null : paybackTurns,
          effects: node.effects.map((e) => ({
            category: techEffectCategory(e.kind),
            label: describeTechEffect(e),
          })),
          unlocksStrategy: strategyEffect
            ? (strategyNameById.get((strategyEffect as { strategyId: string }).strategyId) ??
              (strategyEffect as { strategyId: string }).strategyId)
            : null,
          owned: redact ? false : owned,
          autoGranted: !redact && owned && isPastDecade,
          tierClosed: redact ? false : !tierOpen,
          laneLocked: redact ? false : laneLocked,
          prereqMet: redact ? false : prereqMet,
          pathLocked: redact ? false : pathLocked,
          affordable:
            !redact &&
            isCeo &&
            reached &&
            !owned &&
            tierOpen &&
            !laneLocked &&
            !pathLocked &&
            prereqMet &&
            (rdScore ?? 0) >= node.cost &&
            (liquidCapital ?? 0) >= cashCost,
          image: tierImageUrl(lane, operatingSectorType, decadeId),
        };
      });
    };

    const decades = TECH_DECADES.map((d) => {
      const reached = isDecadeReached(d.id, currentYear);
      const isPastDecade = passedDecades.has(d.id);
      // Past decades have both lanes auto-granted — no lane commitment applies.
      const committed = redact || isPastDecade ? undefined : getCommittedLane(corpView, d.id);
      return {
        id: d.id,
        label: d.label,
        reached,
        autoGrantedDecade: isPastDecade,
        committedLane: committed ?? null,
        lanes: {
          generic: buildLane(d.id, reached, committed, "generic"),
          sector: buildLane(d.id, reached, committed, "sector"),
        },
      };
    });

    // Headline margin = the effective bonus on the corp's PRIMARY sector
    // (Corporate-lane scaled + Sector-lane full), which is the strongest case.
    const agg = redact ? null : getSectorTechEffects(corpView, operatingSectorType);

    // ── Tech overview metrics ──────────────────────────────────────────────
    const totalNodes = (TECH_TREE[operatingSectorType] ?? []).length;
    const techsUnlocked = redact ? 0 : (corporation.unlockedTechNodeIds ?? []).length;
    // Nodes the CEO could unlock right now (affordable across every visible lane).
    const unlockableCount = redact
      ? 0
      : decades.reduce(
          (sum, d) =>
            sum +
            d.lanes.generic.filter((n) => n.affordable).length +
            d.lanes.sector.filter((n) => n.affordable).length,
          0
        );
    // Random R&D breakthrough (rdInnovation): every RD_INNOVATION_INTERVAL turns,
    // probability = min(1, rdScore / threshold). Surfaced read-only for awareness.
    const breakthroughChance = redact
      ? null
      : Math.min(1, (corporation.rdScore ?? 0) / RD_INNOVATION_SCORE_THRESHOLD);
    const unlockedStrategyNames = redact
      ? []
      : getUnlockedStrategyIds(corpView).map((id) => strategyNameById.get(id) ?? id);

    // FX rate for anchor-normalizing the R&D budget in rdGainPerTurn below.
    const corpFxRate = await getCorpFxRate(db, corporation);

    return NextResponse.json({
      enabled: true,
      sectorType: operatingSectorType,
      sectorLabel: OPERATING_SECTOR_TYPE_LABELS[operatingSectorType] ?? operatingSectorType,
      currencyCode: corporation.liquidCurrencyCode ?? "USD",
      currentYear,
      currentDecadeId: getDecadeForYear(currentYear).id,
      isCeo,
      redacted: redact,
      rdScore,
      rdBudget: redact ? null : Math.round(corporation.rdBudget ?? 0),
      // Mirror the turn engine / Budget / Operations formula exactly: FX-anchor
      // the R&D budget and subtract decay (calculateCorpStrengthProjection).
      // Previously fed the RAW local-currency rdBudget straight into calcRdGrowth
      // with no anchor and no decay, which inflated the figure ~2.7× for non-USD
      // corps (e.g. JPY ~130× budget through the log curve) and disagreed with
      // every other tab (#903).
      rdGainPerTurn: redact
        ? null
        : Math.round(
            calculateCorpStrengthProjection(corporation, corpFxRate).rdScoreNetChange * 10
          ) / 10,
      liquidCapital,
      cashPricing: redact
        ? null
        : {
            dailyGrossOperatingScale: Math.round(dailyGrossRevenue ?? 0),
            defaultRevenueFraction: TECH_NODE_CASH_REVENUE_FRACTION,
            capacityFloorApplied,
          },
      unlockedStrategyIds: redact ? [] : getUnlockedStrategyIds(corpView),
      unlockedStrategyNames,
      // Active plant-wide tech effects against their caps.
      plantOutputPct: agg ? Math.round(agg.plantOutputBonus * 1000) / 10 : null,
      plantOutputCapPct: Math.round(TECH_PLANT_OUTPUT_CAP * 100),
      inputEfficiencyPct: agg ? Math.round(agg.inputEfficiencyBonus * 1000) / 10 : null,
      inputEfficiencyCapPct: Math.round(TECH_INPUT_EFFICIENCY_CAP * 100),
      // Overview metrics.
      totalNodes,
      techsUnlocked,
      unlockableCount,
      breakthroughChance,
      breakthroughInterval: RD_INNOVATION_INTERVAL,
      decades,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
