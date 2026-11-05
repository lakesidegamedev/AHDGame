import { describe, expect, it } from "vitest";
import type { FieldOfficeSubdivisionDto } from "@/lib/campaigns/fieldOffices/queries";
import {
  applyFieldOfficeStateView,
  fieldOfficeCountyRows,
  fieldOfficeViewOptions,
  isFieldOfficeView,
  leanFill,
  leanLabel,
  leanSourceNote,
  officesByState,
  openBlockReason,
  pathCentre,
  pinRadius,
  topOpportunityCounties,
  valueFill,
} from "./fieldOfficeMath";

describe("fieldOfficeMath", () => {
  it("labels lean by side, with an even band", () => {
    expect(leanLabel(0.2)).toBe("Even");
    expect(leanLabel(8.14)).toBe("Right +8.1");
    expect(leanLabel(-30.3)).toBe("Left +30.3");
  });
  it("shades left and right apart and saturates", () => {
    expect(leanFill(-20)).not.toBe(leanFill(20));
    expect(leanFill(30)).toBe(leanFill(90));
    expect(leanFill(0)).toBe(leanFill(0.3));
  });
  it("shades value relative to the best spot", () => {
    expect(valueFill(0, 1)).toBe(valueFill(-1, 1));
    expect(valueFill(1, 1)).not.toBe(valueFill(0.2, 1));
    expect(valueFill(1, 0)).toBe(valueFill(0, 0));
  });
  it("centres a polygon path on its bounding box", () => {
    expect(pathCentre("M0,0L10,0L10,4L0,4Z")).toEqual({ x: 5, y: 2 });
    expect(pathCentre("")).toBeNull();
  });
  it("scales pins to the viewBox", () => {
    expect(pinRadius("0 0 100 50")).toBeCloseTo(1.2);
  });
});

const sub = (
  over: Partial<FieldOfficeSubdivisionDto> & { id: string }
): FieldOfficeSubdivisionDto => ({
  name: over.id,
  path: "M0,0L10,0L10,10Z",
  electorateShare: 0.1,
  basePvi: 0,
  livePvi: 0,
  officeId: null,
  ...over,
});

describe("field-office views on the map", () => {
  it("offers lean to everyone and opportunity to managers only", () => {
    expect(fieldOfficeViewOptions(null)).toEqual([]);
    expect(fieldOfficeViewOptions({ enabled: false, canManage: true })).toEqual([]);
    expect(fieldOfficeViewOptions({ enabled: true, canManage: false }).map((v) => v.id)).toEqual([
      "fieldLean",
    ]);
    expect(fieldOfficeViewOptions({ enabled: true, canManage: true }).map((v) => v.id)).toEqual([
      "fieldLean",
      "fieldValue",
    ]);
  });

  it("recognises its own view ids", () => {
    expect(isFieldOfficeView("fieldLean")).toBe(true);
    expect(isFieldOfficeView("fieldValue")).toBe(true);
    expect(isFieldOfficeView("margin")).toBe(false);
  });

  it("paints counties by lean or by opportunity from the same data as the field tab", () => {
    const subs = [
      sub({ id: "A", livePvi: -20, marginalPct: 0.2 }),
      sub({ id: "B", livePvi: 20, marginalPct: 0.8, officeId: "o1" }),
    ];
    const lean = fieldOfficeCountyRows(subs, "fieldLean");
    expect(lean[0].fill).toBe(leanFill(-20));
    expect(lean[1].fill).toBe(leanFill(20));
    const value = fieldOfficeCountyRows(subs, "fieldValue");
    expect(value[0].fill).toBe(valueFill(0.2, 0.8));
    expect(value[1].fill).toBe(valueFill(0.8, 0.8));
    expect(value[1].field?.officeId).toBe("o1");
    expect(value[0].field?.officeId).toBeNull();
  });

  it("counts offices by state from the region list", () => {
    expect(
      officesByState([
        { id: "OH", officeCount: 2 },
        { id: "PA", officeCount: 0 },
      ])
    ).toEqual({ OH: 2 });
  });

  it("ranks the best open counties, skipping held ones and worthless ones", () => {
    const subs = [
      sub({ id: "A", name: "Alpha", marginalPct: 0.3 }),
      sub({ id: "B", name: "Beta", marginalPct: 0.9 }),
      sub({ id: "C", name: "Held", marginalPct: 1.5, officeId: "o" }),
      sub({ id: "D", name: "Dull", marginalPct: 0 }),
      sub({ id: "E", name: "Public" }),
    ];
    expect(topOpportunityCounties(subs, 5).map((s) => s.id)).toEqual(["B", "A"]);
    expect(topOpportunityCounties(subs, 1).map((s) => s.id)).toEqual(["B"]);
  });

  it("explains why an office cannot be opened, and says nothing to those who cannot open one", () => {
    const money = (n: number, c: string) => `${c}${n}`;
    const view = {
      canManage: true,
      raceActive: true,
      cap: 2,
      offices: [{}, {}] as never[],
      costs: { open: 100, upkeep: 5, actions: 2, currency: "$" },
      funds: 500,
      actions: 5,
    };
    expect(openBlockReason(view, money)).toMatch(/allows 2 offices/);
    expect(openBlockReason({ ...view, offices: [] }, money)).toBeNull();
    expect(openBlockReason({ ...view, offices: [], funds: 10 }, money)).toBe(
      "Needs $100 in the war chest."
    );
    expect(openBlockReason({ ...view, offices: [], actions: 1 }, money)).toBe(
      "Needs 2 campaign actions."
    );
    expect(openBlockReason({ ...view, canManage: false }, money)).toBeNull();
    expect(openBlockReason({ ...view, raceActive: false }, money)).toBeNull();
  });

  it("quiets states under a field view and tints the ones with offices", () => {
    const state = (id: string) =>
      ({ id, fill: "#123456", ink: "#fff", caption: "x", evLabel: "9", shares: [] }) as never;
    const model = { states: { OH: state("OH"), PA: state("PA") }, candidates: {} } as never;
    const out = applyFieldOfficeStateView(model, "#101018", { OH: 3 });
    expect(out.states.OH.caption).toBe("3 field offices");
    expect(out.states.PA.caption).toBe("No field offices");
    expect(out.states.OH.fill).not.toBe(out.states.PA.fill);
    expect(out.states.OH.overlay).toBeUndefined();
  });

  it("says where the lean comes from, with the swing when it is live", () => {
    expect(
      leanSourceNote({
        liveLeanActive: false,
        leanSourceLabel: "2020 results",
        liveLeanPriorYear: null,
        liveLeanYear: null,
      })
    ).toBe("County lean from 2020 results");
    expect(
      leanSourceNote({
        liveLeanActive: true,
        leanSourceLabel: null,
        liveLeanPriorYear: 2016,
        liveLeanYear: 2020,
      })
    ).toBe("County lean from past results, shifted by this world's swing from 2016 to 2020");
  });
});
