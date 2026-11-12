import { describe, expect, it } from "vitest";
import { buildConfiguredCountryBillLifecycle } from "@/lib/turn/billLifecycle/configs/configuredCountry";
import { BILL_LIFECYCLE_COUNTRY_IDS } from "@/lib/legislature/billLifecycleCountries";

describe("Canada's national bill lifecycle", () => {
  const lifecycle = buildConfiguredCountryBillLifecycle("CA", "2027-default");

  it("is registered as a walked lifecycle", () => {
    expect(BILL_LIFECYCLE_COUNTRY_IDS.has("CA")).toBe(true);
  });

  it("passes a bill on one Commons vote straight to Royal Assent", () => {
    const votes = lifecycle.stages.filter((stage) => stage.kind === "chamberVote");
    expect(votes).toHaveLength(1);
    const [commons] = votes;
    expect(commons.status).toBe("active");
    expect(commons.onPassStatus).toBe("signed");
    expect(commons.onReject).toBe("fail");
    expect(commons.officeTypeFor({ currentChamber: "caCommons" })).toBe("caCommons");
  });

  it("gives the appointed Senate no vote and the Crown no veto", () => {
    expect(lifecycle.stages.some((stage) => stage.status === "active_other")).toBe(false);
    expect(lifecycle.stages.some((stage) => stage.kind === "executiveAction")).toBe(false);
  });
});
