import { describe, expect, it } from "vitest";
import { convertLivingConflictDef } from "@/lib/livingConflict/rules/crisisV2";
import { AI_LABOUR_SHOCK_DEF } from "@/lib/livingConflict/defs/aiLabourShock";
import { SECOND_PANDEMIC_DEF } from "@/lib/livingConflict/defs/waveFamilies/secondPandemic";
import {
  AI_LABOUR_SHOCK_DEF_KEY,
  SECOND_PANDEMIC_DEF_KEY,
  STANCE_LEVERS,
  isStanceLever,
  stanceIntents,
  stanceLeversFor,
  stanceTradeoff,
} from "./stanceLevers";

const PAN = "lc.second_pandemic";
const LAB = "lc.ai_labour_shock";

describe("stance levers", () => {
  it("offers a lockdown and an open-economy choice on the second pandemic", () => {
    const ids = stanceLeversFor(SECOND_PANDEMIC_DEF_KEY).map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(["lockdown", "stay-open"]));
  });

  it("offers a bailout and a reform choice on the AI labour shock", () => {
    const ids = stanceLeversFor(AI_LABOUR_SHOCK_DEF_KEY).map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(["bail-out-sectors", "structural-reform"]));
  });

  it("offers nothing on other campaigns", () => {
    expect(stanceLeversFor("russia_ukraine_security")).toEqual([]);
  });

  it("uses unique lever ids across both families", () => {
    const ids = Object.values(STANCE_LEVERS).flatMap((e) => e.map((s) => s.lever.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("wires the levers onto the converted living-conflict definitions", () => {
    expect(convertLivingConflictDef(SECOND_PANDEMIC_DEF).levers.map((l) => l.id)).toContain(
      "lockdown"
    );
    expect(convertLivingConflictDef(AI_LABOUR_SHOCK_DEF).levers.map((l) => l.id)).toContain(
      "structural-reform"
    );
  });

  it("makes lockdown and staying open pull opposite ways on health, jobs and votes", () => {
    const lockdown = stanceIntents(PAN, "lockdown");
    const open = stanceIntents(PAN, "stay-open");
    const health = (intents: ReturnType<typeof stanceIntents>) =>
      intents.find((i) => i.kind === "metric" && i.field === "publicHealth");
    expect(health(lockdown)).toMatchObject({ delta: expect.any(Number) });
    expect((health(lockdown) as { delta: number }).delta).toBeGreaterThan(0);
    expect((health(open) as { delta: number }).delta).toBeLessThan(0);
    expect(lockdown.some((i) => i.kind === "bankStress")).toBe(true);
    expect(lockdown.some((i) => i.kind === "bondYield")).toBe(true);
    expect(open.some((i) => i.kind === "electionSwing")).toBe(true);
  });

  it("makes a bailout cheap on jobs and dear on bonds, and reform the reverse on jobs", () => {
    const bailout = stanceIntents(LAB, "bail-out-sectors");
    const reform = stanceIntents(LAB, "structural-reform");
    const jobs = (intents: ReturnType<typeof stanceIntents>) =>
      (
        intents.find((i) => i.kind === "metric" && i.field === "unemploymentRate") as {
          delta: number;
        }
      ).delta;
    expect(jobs(bailout)).toBeLessThan(0);
    expect(jobs(reform)).toBeGreaterThan(0);
    expect(bailout.some((i) => i.kind === "bondYield" && i.deltaBps > 0)).toBe(true);
    expect(reform.some((i) => i.kind === "electionSwing")).toBe(true);
  });

  it("scales a package by intensity and drops a zero-strength pull", () => {
    const full = stanceIntents(LAB, "bail-out-sectors", 1).find((i) => i.kind === "bondYield");
    const half = stanceIntents(LAB, "bail-out-sectors", 0.5).find((i) => i.kind === "bondYield");
    expect((half as { deltaBps: number }).deltaBps).toBeCloseTo(
      (full as { deltaBps: number }).deltaBps / 2
    );
    expect(stanceIntents(LAB, "bail-out-sectors", 0)).toEqual([]);
    expect(stanceIntents(PAN, "not-a-lever")).toEqual([]);
  });

  it("gives every stance lever a plain tradeoff line", () => {
    for (const [key, entries] of Object.entries(STANCE_LEVERS)) {
      for (const { lever } of entries) {
        const text = stanceTradeoff(`lc.${key}`, lever.id);
        expect(text).toBeTruthy();
        expect(text).not.toMatch(/[\u2013\u2014]/);
      }
    }
  });

  it("gives stance levers no mitigation, since they cannot ease severity", () => {
    for (const { lever } of Object.values(STANCE_LEVERS).flat()) expect(lever.mitigation).toBe(0);
  });

  it("keys a package by definition and lever, not the bare lever id", () => {
    expect(stanceIntents(LAB, "lockdown")).toEqual([]);
    expect(stanceTradeoff("lc.other_campaign", "lockdown")).toBeUndefined();
    expect(isStanceLever(PAN, "lockdown")).toBe(true);
    expect(isStanceLever("some.other.def", "lockdown")).toBe(false);
  });

  it("no longer starts an immediate bank panic from lender forbearance", () => {
    expect(stanceIntents(LAB, "lender-forbearance").some((i) => i.kind === "bankStress")).toBe(
      false
    );
  });
});
