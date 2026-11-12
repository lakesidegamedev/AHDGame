import type { Db } from "mongodb";
import type { CorporationType, OperatingSectorType } from "@/lib/constants/corporations";
import { getOperatingSectorType } from "@/lib/constants/sectorStrategies";
import {
  allRealCompanyNames,
  chooseRealCompanyName,
  isRealCompanyWorld,
  realCompanyLogoUrl,
} from "@/lib/corporations/names/realNames";
import { generateTickerSymbol } from "@/lib/corporations/tickerSymbol";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import type { Corporation } from "@/lib/db/types";
import { resolveGameYear } from "@/lib/era/era";
import type { Migration, MigrationResult } from "../types";

type NamedCorporation = Pick<
  Corporation,
  | "_id"
  | "name"
  | "countryId"
  | "type"
  | "industryModel"
  | "mediaDiscriminator"
  | "ceoType"
  | "isNationalized"
  | "logoUrl"
  | "sequentialId"
> & { npcBankSeedKey?: string; isPrimaryNationalCorporation?: boolean };

/**
 * Modern worlds seeded before real company names existed carry invented names
 * on their NPP-run corporations. Rename each to an unused real company for its
 * country and industry, with a fresh ticker and the matching logo. Player-run
 * and state-owned corporations are left alone, as are corporations whose
 * country or industry has no unused real name.
 */
export async function renameNppCorporationsToRealCompanies(
  db: Db,
  dryRun: boolean
): Promise<MigrationResult> {
  const gameState = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { currentYear: 1, currentTurn: 1, startingYear: 1 } }
  );
  const worldYear = gameState ? resolveGameYear(gameState) : null;
  if (!isRealCompanyWorld(worldYear)) {
    return { notes: [`World year ${worldYear ?? "unknown"} keeps invented company names.`] };
  }

  const corporations = await corporationsCollection(db)
    .find({})
    .project<NamedCorporation>({
      name: 1,
      countryId: 1,
      type: 1,
      industryModel: 1,
      mediaDiscriminator: 1,
      ceoType: 1,
      isNationalized: 1,
      isPrimaryNationalCorporation: 1,
      npcBankSeedKey: 1,
      logoUrl: 1,
      sequentialId: 1,
    })
    .sort({ sequentialId: 1 })
    .toArray();

  const realNames = new Set(allRealCompanyNames().map((name) => name.toLowerCase()));
  const takenNames = corporations.map((corp) => corp.name);
  const notes: string[] = [];
  let updated = 0;

  for (const corp of corporations) {
    if (corp.ceoType !== "npp" || corp.isNationalized || corp.isPrimaryNationalCorporation) {
      continue;
    }
    const alreadyReal = realNames.has(corp.name.trim().toLowerCase());
    if (alreadyReal) {
      const logoUrl = realCompanyLogoUrl(corp.name);
      if (logoUrl && !corp.logoUrl) {
        if (!dryRun) {
          await corporationsCollection(db).updateOne(
            { _id: corp._id },
            { $set: { logoUrl, updatedAt: new Date() } }
          );
        }
        updated += 1;
      }
      continue;
    }
    const lane: OperatingSectorType = getOperatingSectorType(
      corp.type as CorporationType,
      corp.industryModel ?? null,
      corp.mediaDiscriminator ?? null
    );
    const position = corporations.indexOf(corp);
    const newName = chooseRealCompanyName({
      countryId: corp.countryId,
      lane,
      kind: corp.npcBankSeedKey ? "bank" : "sector",
      existingNames: takenNames,
      rng: () => (position % 97) / 97,
    });
    if (!newName) continue;
    takenNames.push(newName);
    notes.push(`${corp.countryId}: ${corp.name} -> ${newName}`);
    updated += 1;
    if (dryRun) continue;
    const logoUrl = realCompanyLogoUrl(newName);
    await corporationsCollection(db).updateOne(
      { _id: corp._id },
      {
        $set: {
          name: newName,
          tickerSymbol: await generateTickerSymbol(db, newName),
          ...(logoUrl && !corp.logoUrl ? { logoUrl } : {}),
          updatedAt: new Date(),
        },
      }
    );
  }

  return { documentsScanned: corporations.length, documentsUpdated: updated, notes };
}

export const migration: Migration = {
  id: "2026-11-12-real-company-names",
  description:
    "Rename NPP-run corporations in modern worlds to real companies for their country and industry, and attach the matching logos.",
  idempotent: true,
  execute: (db, ctx) => renameNppCorporationsToRealCompanies(db, ctx.dryRun),
};
