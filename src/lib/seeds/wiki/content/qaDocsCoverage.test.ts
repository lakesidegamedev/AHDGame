import { describe, expect, it } from "vitest";
import { governmentApprovalContent } from "./governmentApproval";
import { nationalMetricsContent } from "./nationalMetrics";
import { currencyExchangeContent } from "./currencyExchange";
import { partyMembershipContent } from "./partyMembership";
import { playerProgressionContent } from "./playerProgression";
import { gettingStartedContent } from "./gettingStarted";

describe("wiki explains what players kept asking about", () => {
  it("documents approval badges, the pp number, the margin cap and smoothing", () => {
    expect(governmentApprovalContent).toContain("## Reading the condition badges");
    expect(governmentApprovalContent).toContain("at most 3 points");
    expect(governmentApprovalContent).toContain("Gradual movement toward target");
  });
  it("documents provisional vs sourced metrics and domain scores", () => {
    expect(nationalMetricsContent).toContain("sourced");
    expect(nationalMetricsContent).toContain("provisional");
    expect(nationalMetricsContent).toContain("domain score");
  });
  it("names the accounting unit symbol", () => {
    expect(currencyExchangeContent).toContain("₳");
  });
  it("says party and politician counts include NPPs", () => {
    expect(partyMembershipContent).toContain("include non-player politicians");
  });
  it("quotes the same scaled spawn funds everywhere", () => {
    expect(playerProgressionContent).toContain("₳345,000");
    expect(gettingStartedContent).toContain("345,000");
  });
});
