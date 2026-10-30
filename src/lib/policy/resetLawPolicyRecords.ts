import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { Bill } from "@/lib/db/types";
import type { GameState } from "@/lib/db/types";
import { yearOfTurn } from "@/lib/utils/gameDate";
import { resetLawFamilyById } from "@/lib/resetLegislation/catalog";
import type { ResetLawProgramDocument } from "@/lib/resetLegislation/program";
import {
  buildResetLawProvenance,
  buildResetLawRecord,
  type ResetLawProgramRow,
} from "./rules/resetLawRecords";
import type { PolicyRecordResponse } from "./types";
import type { PolicyProvenance } from "./policyRecordPayload";

/** Enacted reset-era program laws for one country (national) or region, as display rows. */
export async function loadResetLawProgramRows(
  db: Db,
  countryId: string,
  scope: "national" | "regional",
  regionId?: string
): Promise<ResetLawProgramRow[]> {
  const gameState = await db
    .collection<GameState>("gameState")
    .findOne(
      { _id: "current" },
      { projection: { resetWorldId: 1, startingYear: 1, preIteration: 1, preIterationTurns: 1 } }
    );
  const worldId = gameState?.resetWorldId;
  if (!worldId) return [];
  const programs = await db
    .collection<ResetLawProgramDocument>("resetLawPrograms")
    .find({
      worldId,
      country: countryId as ResetLawProgramDocument["country"],
      scope,
      ...(scope === "regional" ? { regionId } : {}),
    })
    .toArray();
  if (programs.length === 0) return [];
  const billIds = [...new Set(programs.map((program) => program.enactedByBillId.toString()))];
  const bills = await db
    .collection<Bill>("bills")
    .find(
      { _id: { $in: billIds.map((id) => new ObjectId(id)) } },
      { projection: { title: 1, enactedAt: 1 } }
    )
    .toArray();
  const billById = new Map(bills.map((bill) => [bill._id.toString(), bill]));
  return programs.map((program) => {
    const bill = billById.get(program.enactedByBillId.toString());
    const enactedAt = bill?.enactedAt ? new Date(bill.enactedAt) : null;
    return {
      familyId: program.familyId,
      familyTitle: resetLawFamilyById(program.familyId)?.title ?? program.titleSnapshot,
      choice: program.choice,
      titleSnapshot: program.titleSnapshot,
      descriptionSnapshot: program.descriptionSnapshot,
      effectiveTurn: program.effectiveTurn,
      enactedByBillId: program.enactedByBillId.toString(),
      billTitle: bill?.title ?? null,
      enactedAt,
      // The game year the program took effect, like every other statute's enactedYear.
      enactedYear: yearOfTurn(program.effectiveTurn, gameState?.startingYear ?? 1991, {
        preIterationActive: gameState?.preIteration?.active,
        preIterationTurns: gameState?.preIterationTurns,
      }),
    };
  });
}

export async function loadResetLawPolicyRecords(
  db: Db,
  countryId: string,
  scope: "national" | "regional",
  regionId?: string
): Promise<PolicyRecordResponse[]> {
  return (await loadResetLawProgramRows(db, countryId, scope, regionId)).map(buildResetLawRecord);
}

export async function loadResetLawProvenance(
  db: Db,
  countryId: string,
  scope: "national" | "regional",
  regionId?: string
): Promise<Record<string, PolicyProvenance>> {
  return buildResetLawProvenance(await loadResetLawProgramRows(db, countryId, scope, regionId));
}
