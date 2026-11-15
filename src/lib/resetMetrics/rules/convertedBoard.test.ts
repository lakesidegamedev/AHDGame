import { describe, expect, it } from "vitest";
import { buildOpeningMetricSnapshots1991 } from "../seedOpening1991";
import { buildResetMetricSnapshot, normalizeNationalMetricBoard } from "./snapshot";
import { normalizeConvertedMetricBoard } from "./convertedBoard";
import { buildSuccessorMetricRows } from "@/lib/referendum/secede/rules/resetV2Promotion";
import { transferResetV2MetricToIreland } from "@/lib/referendum/transfer/rules/resetV2Transfer";

const opening = buildOpeningMetricSnapshots1991("converted-test", 1);
describe("converted metric continuity", () => {
  it.each(["SCO", "WAL"] as const)(
    "publishes valid %s regions without fabricating measurement dates",
    (countryId) => {
      const aggregate = structuredClone(opening.find((b) => b._id === `UK:${countryId}`)!);
      aggregate.asOfTurn = 817;
      for (const row of Object.values(aggregate.observations)) row.lastUpdatedTurn = 817;
      const boards = buildSuccessorMetricRows({
        countryId,
        aggregate,
        national: opening.find((b) => b._id === "UK:national")!,
        regions: [{ id: "test", population: 100 }],
        turn: 818,
      });
      const regional = boards[1];
      expect(() => buildResetMetricSnapshot(regional)).not.toThrow();
      expect(regional.observations["01"]).toMatchObject({
        lastUpdatedTurn: 818,
        observedAtTurn: 817,
      });
      const broken = structuredClone(regional);
      broken.observations["01"].lastUpdatedTurn = 817;
      const fixed = normalizeNationalMetricBoard(broken);
      expect(() => buildResetMetricSnapshot(fixed)).not.toThrow();
      expect(fixed.history).toEqual(broken.history);
      expect(fixed.observations["01"].value).toBe(broken.observations["01"].value);
      expect(normalizeConvertedMetricBoard(fixed)).toBe(fixed);
    }
  );
  it("does not certify Northern Ireland using UK-wide household coverage", () => {
    const source = structuredClone(opening.find((b) => b._id === "UK:NIR")!);
    for (const id of ["02", "03", "04"]) {
      source.observations[id] = {
        ...source.observations[id],
        definitionVersion: 2,
        observedAtTurn: 817,
        countryBasis: {
          countryId: "UK",
          coverageKey: "UK-regions",
          measurementTurn: 817,
          value: 123,
        },
      };
    }
    const moved = transferResetV2MetricToIreland(source, "NIR", 0.97);
    for (const id of ["02", "03", "04"]) {
      expect(moved.observations[id]).toMatchObject({ status: "proxy", observedAtTurn: 817 });
      expect(moved.observations[id].countryBasis).toBeUndefined();
      expect(moved.observations[id].definitionVersion).toBeUndefined();
    }
    expect(source.observations["02"].definitionVersion).toBe(2);
    expect(moved.observations["03"].value).toBe(source.observations["03"].value);
    expect(moved.observations["02"].value).toBe(source.observations["02"].value! * 0.97);
    const existing = { ...source, _id: "IE:NIR", countryId: "IE" as const };
    expect(normalizeConvertedMetricBoard(existing).observations["03"]).toEqual(
      moved.observations["03"]
    );
  });
  it("leaves current Irish certifications and unrelated invalid timestamps untouched", () => {
    const board = structuredClone(opening.find((b) => b._id === "IE:DUB")!);
    board.observations["03"].countryBasis = {
      countryId: "IE",
      coverageKey: "IE-regions",
      measurementTurn: 1,
      value: 20,
    };
    board.observations["03"].definitionVersion = 2;
    expect(normalizeConvertedMetricBoard(board)).toBe(board);
    board.observations["01"].lastUpdatedTurn = 0;
    expect(() => buildResetMetricSnapshot(normalizeConvertedMetricBoard(board))).toThrow();
  });
});
