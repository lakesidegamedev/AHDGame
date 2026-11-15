import { describe, expect, it } from "vitest";
import {
  GAME_CONFIG_SURVIVORS,
  gameConfigKeySurvives,
  gameConfigResidue,
} from "./gameConfigSurvival";

describe("gameConfig survivors", () => {
  it("gives every group a reason", () => {
    for (const group of GAME_CONFIG_SURVIVORS) expect(group.reason.length).toBeGreaterThan(10);
  });

  it("keeps the operator switches named by the owner", () => {
    for (const key of [
      "turnResilienceStage",
      "wholePlantsStage",
      "maintenanceMode",
      "auditLog",
      "firstJoinerBecomesPartyChair",
      "lastReset",
      "privateBankingEnabled",
      "discordNewsWebhookUrl",
    ])
      expect(gameConfigKeySurvives(key), key).toBe(true);
  });

  it("does not keep world state or turn anchors", () => {
    for (const key of [
      "producerMarketLiveFromTurn",
      "marketGuardReferenceMcap",
      "economyMarketProgramCommit",
      "countryRecessions",
      "baseActionsPerTurn",
    ])
      expect(gameConfigKeySurvives(key), key).toBe(false);
  });
});

describe("gameConfigResidue", () => {
  const seed = { baseActionsPerTurn: 5, startingYear: 2027 };

  it("passes survivors with operator values and seed-equal keys", () => {
    expect(
      gameConfigResidue(
        { _id: "default", baseActionsPerTurn: 5, turnResilienceStage: 1, auditLog: true },
        seed
      )
    ).toEqual([]);
  });
  it("fails a non-survivor that differs from the seed", () => {
    expect(gameConfigResidue({ baseActionsPerTurn: 9 }, seed)).toEqual(["baseActionsPerTurn"]);
  });
  it("fails a key the seed does not define and no survivor group covers", () => {
    expect(gameConfigResidue({ producerMarketLiveFromTurn: 400 }, seed)).toEqual([
      "producerMarketLiveFromTurn",
    ]);
  });
});
