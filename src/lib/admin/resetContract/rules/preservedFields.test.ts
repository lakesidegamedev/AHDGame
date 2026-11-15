import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import { getPreservedCollectionNames } from "@/lib/admin/seed/seedManifest";
import {
  IMPERIAL_CHARACTER_FIELD_CONTRACT,
  PRESERVED_COLLECTION_CONTRACT,
  USER_FIELD_CONTRACT,
  preservedFieldResetUpdate,
  preservedFieldResidue,
} from "./preservedFields";

function interfaceFieldNames(file: string, typeName: string): string[] {
  const sourcePath = resolve(process.cwd(), file);
  const source = ts.createSourceFile(
    sourcePath,
    readFileSync(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const declaration = source.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === typeName
  );
  if (!declaration) throw new Error(`${typeName} was not found in ${file}`);
  return declaration.members
    .filter(ts.isPropertySignature)
    .map((member) => member.name.getText(source).replace(/\?$/, ""));
}

describe("preserved collection contract", () => {
  it("classifies every preserved collection in the seed manifest, and nothing else", () => {
    expect(Object.keys(PRESERVED_COLLECTION_CONTRACT).sort()).toEqual(
      getPreservedCollectionNames().sort()
    );
  });

  for (const [collection, rule] of Object.entries(PRESERVED_COLLECTION_CONTRACT)) {
    if (rule.kind !== "fields") continue;
    it(`classifies every ${rule.typeName} field on ${collection}`, () => {
      const declared = interfaceFieldNames(rule.typeFile, rule.typeName).sort();
      const classified = Object.keys(rule.fields).sort();
      expect(
        declared.filter((field) => !classified.includes(field)),
        `unclassified ${rule.typeName} fields: add keep, clear or reset to the contract`
      ).toEqual([]);
      expect(
        classified.filter((field) => !declared.includes(field)),
        `contract names fields ${rule.typeName} no longer declares`
      ).toEqual([]);
    });
  }

  it("gives every rule a reason", () => {
    for (const rule of Object.values(PRESERVED_COLLECTION_CONTRACT)) {
      if (rule.kind !== "fields") {
        expect(rule.reason.length).toBeGreaterThan(0);
        continue;
      }
      for (const field of Object.values(rule.fields))
        expect(field.reason.length).toBeGreaterThan(0);
    }
  });

  it("clears the old world's character pointers, cooldowns and corporation references", () => {
    const update = preservedFieldResetUpdate(USER_FIELD_CONTRACT);
    expect(update.unset).toEqual(
      expect.arrayContaining([
        "activeCharacterId",
        "activeImperialCharacterId",
        "activeCharacterType",
        "lastCorporationFoundedTurn",
        "bannedShareReleaseCorporationIds",
        "widgetWatchlist",
        "wireQuotaUsed",
      ])
    );
    expect(update.set).toEqual({ hasCompletedSetup: false, activeCharacterCount: 0 });
    for (const kept of [
      "email",
      "password",
      "isBanned",
      "modNotes",
      "lastRetiredAt",
      "createdAt",
    ]) {
      expect(update.unset).not.toContain(kept);
      expect(update.set).not.toHaveProperty(kept);
    }
  });

  it("empties imperial wallets and restores the authored income tier", () => {
    const update = preservedFieldResetUpdate(IMPERIAL_CHARACTER_FIELD_CONTRACT);
    expect(update.set).toEqual({
      cashOnHand: 0,
      currencyBalances: { personal: {} },
      incomeTaxStartTurn: 1,
      incomeTaxBatchReceipt: null,
      pendingStockTaxReceipts: [],
    });
    expect(update.derive).toEqual({ incomeTier: { $ifNull: ["$initialIncomeTier", "high"] } });
    expect(update.unset).toEqual([]);
  });

  it("refuses a reset value that a pipeline would read as a field path", () => {
    expect(() =>
      preservedFieldResetUpdate({ x: { action: "reset", value: "$oops", reason: "test" } })
    ).toThrow(/field path/);
  });

  it("reports cleared or unreset fields still on a surviving document", () => {
    expect(
      preservedFieldResidue(USER_FIELD_CONTRACT, {
        activeCharacterId: "c1",
        lastCorporationFoundedTurn: 944,
        activeCharacterCount: 1,
        hasCompletedSetup: false,
        email: "kept",
      }).sort()
    ).toEqual(["activeCharacterCount", "activeCharacterId", "lastCorporationFoundedTurn"]);
    expect(
      preservedFieldResidue(USER_FIELD_CONTRACT, {
        activeCharacterId: null,
        activeCharacterCount: 0,
        hasCompletedSetup: false,
      })
    ).toEqual([]);
    expect(
      preservedFieldResidue(IMPERIAL_CHARACTER_FIELD_CONTRACT, {
        cashOnHand: 5_000_000,
        currencyBalances: { personal: { USD: 12 } },
      }).sort()
    ).toEqual(["cashOnHand", "currencyBalances"]);
  });
});
