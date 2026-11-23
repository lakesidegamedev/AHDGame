import { describe, expect, it } from "vitest";

import type { FederalBudget, LegislationType } from "@/lib/db/types";
import { backfillNationalTaxPolicyRecords, buildPolicyResponse } from "./nationalPolicyRecords";

const modernIncomeTax = {
  _id: "dd.tax.incomeTax",
  name: "Wage Tax Act",
  policyDomain: "tax",
  taxSlider: {
    scope: "federal",
    taxType: "incomeTax",
    minRate: 0,
    maxRate: 60,
    step: 1,
    baselineRate: 12,
    waypoints: [],
  },
} as unknown as LegislationType;

const legacyIncomeTax = {
  _id: "dd_income_tax",
  name: "Citizens' Income Tax Statute",
  policyDomain: "tax",
  taxRateChange: { scope: "federal", taxType: "incomeTax" },
  policyOptions: [
    { id: "low", name: "12%", rate: 12, economic: 0, social: 0 },
    { id: "high", name: "30%", rate: 30, economic: -2, social: 0 },
  ],
} as unknown as LegislationType;

describe("national tax policy records", () => {
  it("shows the same retained effects as the turn engine for calibrated legacy taxes", () => {
    const type = {
      ...legacyIncomeTax,
      _id: "ng_personal_income_tax",
      policyOptions: [
        {
          id: "retained",
          name: "19%",
          rate: 19,
          economic: 1,
          social: 0,
          metricEffects: [
            { category: "economic", metricId: "smallBusinessFormation", ratePerTurn: 0.2 },
          ],
        },
        { id: "center", name: "24%", rate: 24, economic: 0, social: 0, metricEffects: [] },
      ],
    } as LegislationType;
    const row = buildPolicyResponse(
      {
        scope: "national",
        legislationTypeId: type._id,
        policyOptionId: "rate:24",
        policyOptionIndex: 0,
        economic: 0,
        social: 0,
        updatedAt: new Date(0),
      },
      type
    );
    expect(row.policyOptionName).toBe("Rate: 24%");
    expect(row.metricEffects).toEqual([
      { category: "economic", metricId: "smallBusinessFormation", ratePerTurn: 0.2 },
    ]);
  });
  it("shows an exact calibrated rate on a legacy tax record without a budget", () => {
    const row = buildPolicyResponse(
      {
        scope: "national",
        legislationTypeId: legacyIncomeTax._id,
        policyOptionId: "rate:22",
        economic: 0,
        social: 0,
        updatedAt: new Date(0),
      },
      legacyIncomeTax
    );
    expect(row.policyOptionName).toBe("Rate: 22%");
  });

  it("shows effective and pending rates for legacy taxes instead of an ideology-matched option", () => {
    const row = buildPolicyResponse(
      {
        scope: "national",
        legislationTypeId: legacyIncomeTax._id,
        policyOptionId: "high",
        economic: 0,
        social: 0,
        updatedAt: new Date(0),
      },
      legacyIncomeTax,
      null,
      { taxRates: { incomeTax: 22 }, taxRatePhaseIn: { incomeTax: 30 } } as FederalBudget
    );
    expect(row.policyOptionName).toBe("Rate: 22% (target 30%, phasing in)");
  });

  it("shows the enacted rate encoded by a modern tax-slider policy", () => {
    const row = buildPolicyResponse(
      {
        scope: "national",
        stateId: "dd_national",
        legislationTypeId: modernIncomeTax._id,
        policyOptionId: "rate:16",
        economic: -0.67,
        social: 0,
        updatedAt: new Date(0),
      },
      modernIncomeTax
    );

    expect(row.policyOptionName).toBe("Rate: 16%");
  });

  it("shows the live budget rate and the enacted target while a tax rate phases in", () => {
    const row = buildPolicyResponse(
      {
        scope: "national",
        stateId: "dd_national",
        legislationTypeId: modernIncomeTax._id,
        policyOptionId: "rate:16",
        economic: -0.67,
        social: 0,
        updatedAt: new Date(0),
      },
      modernIncomeTax,
      null,
      {
        _id: "DD",
        taxRates: { incomeTax: 12 },
        taxRatePhaseIn: { incomeTax: 16 },
      } as unknown as FederalBudget
    );

    expect(row.policyOptionName).toBe("Rate: 12% (target 16%, phasing in)");
  });

  it("does not backfill a second legacy law for a tax type controlled by a modern record", () => {
    const records = new Map([
      [
        modernIncomeTax._id,
        {
          scope: "national" as const,
          stateId: "dd_national",
          legislationTypeId: modernIncomeTax._id,
          policyOptionId: "rate:16",
          economic: -0.67,
          social: 0,
          updatedAt: new Date(0),
        },
      ],
    ]);

    backfillNationalTaxPolicyRecords({
      budget: {
        _id: "DD",
        taxRates: { incomeTax: 16 },
      } as unknown as FederalBudget,
      legislationTypes: [modernIncomeTax, legacyIncomeTax],
      nationalStateId: "dd_national",
      recordsByCanonicalId: records,
    });

    expect(records.has(legacyIncomeTax._id)).toBe(false);
  });
});

describe("saved national policy choices", () => {
  const type = {
    _id: "us.governance.integrity.primary",
    name: "Ethics",
    policyOptions: [
      { id: "l0", name: "No Watchdogs", economic: 0, social: 0 },
      {
        id: "l2",
        name: "Ethics Enforcement",
        economic: 0,
        social: 0,
        metricEffects: [{ category: "governance", metricId: "corruption", ratePerTurn: -0.2 }],
      },
    ],
  } as LegislationType;
  const record = {
    scope: "national" as const,
    legislationTypeId: type._id,
    economic: 0,
    social: 0,
    updatedAt: new Date(0),
  };
  it("honors the option id when ideological coordinates collide", () => {
    const row = buildPolicyResponse(
      { ...record, policyOptionId: "l2", policyOptionIndex: 0 },
      type
    );
    expect(row.policyOptionName).toBe("Ethics Enforcement");
    expect(row.metricEffects).toHaveLength(1);
  });
  it("uses a valid saved index before coordinate fallback", () => {
    expect(buildPolicyResponse({ ...record, policyOptionIndex: 1 }, type).policyOptionName).toBe(
      "Ethics Enforcement"
    );
    expect(buildPolicyResponse({ ...record, policyOptionIndex: -1 }, type).policyOptionName).toBe(
      "No Watchdogs"
    );
  });
});

describe("national statute level display", () => {
  const ladder = {
    _id: "us.governance.integrity.primary",
    name: "Ethics and Audit Act",
    policyDomain: "governance",
    policyOptions: [
      { id: "l0", name: "No Watchdogs", economic: 0, social: 0 },
      { id: "l1", name: "Audit Office", economic: 0, social: 0 },
      { id: "l2", name: "Ethics Enforcement", economic: 0, social: 0 },
    ],
  } as unknown as LegislationType;

  it("shows the stored level when every level shares the same lean", () => {
    const row = buildPolicyResponse(
      {
        scope: "national",
        stateId: "federal",
        legislationTypeId: ladder._id,
        policyOptionId: "l2",
        policyOptionIndex: 2,
        economic: 0,
        social: 0,
        updatedAt: new Date(0),
      },
      ladder
    );
    expect(row.policyOptionName).toBe("Ethics Enforcement");
  });

  it("falls back to the lean match when the record has no stored option", () => {
    const row = buildPolicyResponse(
      {
        scope: "national",
        stateId: "federal",
        legislationTypeId: ladder._id,
        economic: 0,
        social: 0,
        updatedAt: new Date(0),
      },
      ladder
    );
    expect(row.policyOptionName).toBe("No Watchdogs");
  });
});
