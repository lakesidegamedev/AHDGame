import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import { PARTY_FIELD_CONTRACT, partyResetUpdate, partyResidue } from "./survivingParties";

function interfaceFieldNames(file: string, typeName: string): string[] {
  const sourcePath = resolve(process.cwd(), file);
  const source = ts.createSourceFile(
    sourcePath,
    readFileSync(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const declaration = source.statements.find(
    (s): s is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(s) && s.name.text === typeName
  );
  if (!declaration) throw new Error(`${typeName} not found`);
  return declaration.members
    .filter(ts.isPropertySignature)
    .map((m) => m.name.getText(source).replace(/\?$/, ""));
}

const seedValues = { name: "Labour Party", abbreviation: "LAB", tier: "major", color: "#E4003B" };
const oldLabour = {
  _id: "id",
  sequentialId: 44,
  countryId: "UK",
  isDefault: true,
  name: "Labour Party",
  abbreviation: "LAB",
  tier: "minor",
  treasury: 5,
  memberCount: 12,
  chairId: "someone",
  isDefunct: true,
  defunctAtTurn: 52,
  mergedIntoPartyId: "other",
  leadershipTitles: { chair: "Leader of the Co-operative Party" },
  majorDemotionWarning: { startedTurn: 819 },
  appliedMoneyFlowKeys: ["a"],
  somethingNew: 1,
  discordInviteUrl: "https://discord.gg/x",
};

describe("party field contract", () => {
  it("classifies every PoliticalParty field, and names none that no longer exist", () => {
    const declared = interfaceFieldNames("src/lib/db/types/party.ts", "PoliticalParty").sort();
    const classified = Object.keys(PARTY_FIELD_CONTRACT).sort();
    expect(declared.filter((f) => !classified.includes(f))).toEqual([]);
    expect(classified.filter((f) => !declared.includes(f))).toEqual([]);
  });

  it("keeps identity only, with a reason for every field", () => {
    const kept = Object.entries(PARTY_FIELD_CONTRACT)
      .filter(([, r]) => r.action === "keep")
      .map(([f]) => f)
      .sort();
    expect(kept).toEqual([
      "_id",
      "countryId",
      "createdAt",
      "createdBy",
      "discordInviteUrl",
      "isDefault",
      "sequentialId",
      "updatedAt",
    ]);
    for (const rule of Object.values(PARTY_FIELD_CONTRACT))
      expect(rule.reason.length).toBeGreaterThan(5);
  });
});

describe("partyResetUpdate", () => {
  const update = partyResetUpdate(oldLabour, seedValues);

  it("removes the merger, titles, warning, keys and unknown fields", () => {
    expect(update.unset).toEqual(
      expect.arrayContaining([
        "isDefunct",
        "defunctAtTurn",
        "mergedIntoPartyId",
        "leadershipTitles",
        "majorDemotionWarning",
        "appliedMoneyFlowKeys",
        "somethingNew",
      ])
    );
  });
  it("restamps seed fields and resets fresh-world constants", () => {
    expect(update.set).toMatchObject({
      tier: "major",
      treasury: 1_000_000,
      memberCount: 0,
      chairId: null,
    });
  });
  it("never touches identity, including the Discord link", () => {
    for (const f of ["_id", "sequentialId", "countryId", "isDefault", "discordInviteUrl"]) {
      expect(update.unset).not.toContain(f);
      expect(Object.keys(update.set)).not.toContain(f);
    }
  });
});

describe("partyResidue (the rehearsal gate)", () => {
  it("fails a defunct, merged party", () => {
    const fields = partyResidue(oldLabour, seedValues);
    expect(fields).toEqual(expect.arrayContaining(["isDefunct", "mergedIntoPartyId", "tier"]));
  });
  it("fails a field outside the contract", () => {
    expect(partyResidue({ ...oldLabour, isDefunct: undefined, somethingNew: 1 }, null)).toContain(
      "somethingNew"
    );
  });
  it("passes a party after the reset update", () => {
    const { set, unset } = partyResetUpdate(oldLabour, seedValues);
    const after: Record<string, unknown> = { ...oldLabour, ...set };
    for (const f of unset) delete after[f];
    expect(partyResidue(after, seedValues)).toEqual([]);
  });
});
