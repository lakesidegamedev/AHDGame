/**
 * Once a turn: enforce the Subsidiary Limits and Foreign Investment Acts.
 *
 * 1. Find every subsidiary that breaches its country's law today
 *    (mechanicalLaws/enforcementRules), from the turn's in-memory
 *    corporations and sectors plus one read of the law levels.
 * 2. A newly breaching company gets an order: its group has 48 turns to give
 *    up control (sell, spin off or release it). The group's owner is told.
 * 3. An order whose company no longer breaches is cleared.
 * 4. An order past its deadline is carried out: the controlling stake is sold
 *    down to half at book value into the equity market. If the market cannot
 *    pay this turn, the order stands and is retried next turn.
 *
 * Every law starts open, so this pass changes nothing until a legislature
 * tightens one.
 */
import { processBreakupCases } from "./antitrustBreakups";
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import type { CorporationLookups } from "./types";
import { getControllingCorporateParent } from "@/lib/corporations/corporateOwnership";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { getMechanicalLawLevelsByCountry } from "@/lib/mechanicalLaws/levels";
import {
  complianceReasonText,
  findNoncompliantSubsidiaries,
  type ComplianceFinding,
  type ControlRow,
  type IndustryRow,
  type LawLevels,
} from "@/lib/mechanicalLaws/enforcementRules";
import { MECHANICAL_LAW_COMPLIANCE_TURNS } from "@/lib/mechanicalLaws/rules";
import { executeForcedDivestiture } from "@/lib/mechanicalLaws/forcedDivestiture";
import { createNotifications, type NotificationInput } from "@/lib/notifications";

/** Most forced sales carried out in one turn; the rest wait a turn. */
const MAX_FORCED_SALES_PER_TURN = 20;

export interface AntitrustComplianceResult {
  ordered: number;
  cleared: number;
  sold: number;
  deferred: number;
  casesOpened?: number;
  breakupsOrdered?: number;
  casesDismissed?: number;
}

/** Pure: the control rows and industry rows the rules need, from the turn snapshot. */
export function complianceInputs(
  lookups: Pick<CorporationLookups, "corporations" | "sectorsByCorp">
): { rows: ControlRow[]; industry: IndustryRow[] } {
  const rows: ControlRow[] = [];
  const industry: IndustryRow[] = [];
  for (const corp of lookups.corporations) {
    if (isStateOwned(corp)) continue;
    const parent = getControllingCorporateParent(corp);
    rows.push({
      id: corp._id.toString(),
      countryId: corp.countryId,
      ...(parent ? { parentId: parent.corporationId.toString() } : {}),
      ...(corp.subsidiaryFormalizedAtTurn != null
        ? { formalizedAtTurn: corp.subsidiaryFormalizedAtTurn }
        : {}),
    });
    for (const sector of lookups.sectorsByCorp.get(corp._id.toString()) ?? []) {
      const revenue = sector.realizedRevenue ?? sector.revenue ?? 0;
      if (revenue > 0) {
        industry.push({
          corpId: corp._id.toString(),
          countryId: sector.countryId,
          sectorType: sector.sectorType,
          revenue,
        });
      }
    }
  }
  return { rows, industry };
}

export async function processAntitrustCompliance(
  db: Db,
  lookups: Pick<
    CorporationLookups,
    "corporations" | "sectorsByCorp" | "exchangeRatesByCurrency" | "eraYear"
  >,
  turn: number,
  now: Date = new Date()
): Promise<AntitrustComplianceResult> {
  const result: AntitrustComplianceResult = { ordered: 0, cleared: 0, sold: 0, deferred: 0 };
  const { rows, industry } = complianceInputs(lookups);
  const countries = [...new Set(rows.map((r) => r.countryId))] as CountryId[];
  const levels = await getMechanicalLawLevelsByCountry(db, countries);
  const levelsByCountry = new Map<string, LawLevels>(
    [...levels].map(([cc, l]) => [
      cc,
      { subsidiaryLimits: l.subsidiaryLimits, foreignInvestment: l.foreignInvestment },
    ])
  );
  const findings = new Map<string, ComplianceFinding>(
    findNoncompliantSubsidiaries({ rows, levelsByCountry, industry }).map((f) => [f.corpId, f])
  );

  const corpById = new Map(lookups.corporations.map((c) => [c._id.toString(), c]));
  const ops: AnyBulkWriteOperation<Corporation>[] = [];
  const notices: NotificationInput[] = [];
  const notifyOwner = (
    root: Corporation | undefined,
    title: string,
    message: string,
    type: NotificationInput["type"],
    corpId: string
  ) => {
    if (root?.userId) {
      notices.push({
        userId: root.userId,
        type,
        title,
        message,
        metadata: { corporationId: corpId },
      });
    }
  };
  const due: { target: Corporation; finding: NonNullable<Corporation["antitrustDivestiture"]> }[] =
    [];

  for (const corp of lookups.corporations) {
    const id = corp._id.toString();
    const finding = findings.get(id);
    const order = corp.antitrustDivestiture;
    if (order && !finding) {
      ops.push({
        updateOne: { filter: { _id: corp._id }, update: { $unset: { antitrustDivestiture: "" } } },
      });
      delete corp.antitrustDivestiture;
      result.cleared++;
      continue;
    }
    if (!finding) continue;
    if (!order) {
      const next = {
        reason: finding.reason,
        countryId: finding.countryId,
        rootCorporationId: finding.rootId,
        sinceTurn: turn,
        dueTurn: turn + MECHANICAL_LAW_COMPLIANCE_TURNS,
      };
      ops.push({
        updateOne: { filter: { _id: corp._id }, update: { $set: { antitrustDivestiture: next } } },
      });
      corp.antitrustDivestiture = next;
      result.ordered++;
      notifyOwner(
        corpById.get(finding.rootId),
        `Order to give up control of ${corp.name}`,
        `${complianceReasonText(finding.reason)}. Sell, spin off or release ${corp.name} by turn ${next.dueTurn}, or your controlling stake will be sold at book value.`,
        "antitrust_divestiture_ordered",
        id
      );
      continue;
    }
    if (turn >= order.dueTurn) due.push({ target: corp, finding: order });
  }

  if (ops.length > 0) await db.collection<Corporation>("corporations").bulkWrite(ops);

  const settled: AnyBulkWriteOperation<Corporation>[] = [];
  for (const { target, finding } of due.slice(0, MAX_FORCED_SALES_PER_TURN)) {
    const parentRef = getControllingCorporateParent(target);
    const parent = parentRef ? corpById.get(parentRef.corporationId.toString()) : undefined;
    if (!parent) continue;
    const outcome = await executeForcedDivestiture(db, {
      target,
      parent,
      exchangeRatesByCurrency: lookups.exchangeRatesByCurrency,
      turn,
      now,
    });
    if (outcome.status === "sold" || outcome.status === "noControl") {
      settled.push({
        updateOne: {
          filter: { _id: target._id },
          update: { $unset: { antitrustDivestiture: "" } },
        },
      });
      if (outcome.status === "sold") {
        result.sold++;
        notifyOwner(
          corpById.get(finding.rootCorporationId),
          `Stake in ${target.name} sold`,
          `The deadline passed, so ${outcome.shares.toLocaleString()} shares of ${target.name} were sold at book value and your group no longer controls it.`,
          "antitrust_divestiture_executed",
          target._id.toString()
        );
      }
    } else {
      result.deferred++;
    }
  }

  if (settled.length > 0) await db.collection<Corporation>("corporations").bulkWrite(settled);

  const breakups = await processBreakupCases(db, {
    corporations: lookups.corporations,
    rows,
    industry,
    competitionLevelByCountry: new Map([...levels].map(([cc, l]) => [cc, l.competition])),
    turn,
    currentYear: lookups.eraYear ?? null,
    notices,
  });
  result.casesOpened = breakups.opened;
  result.breakupsOrdered = breakups.ordered;
  result.casesDismissed = breakups.dismissed;

  if (notices.length > 0) await createNotifications(notices);
  return result;
}
