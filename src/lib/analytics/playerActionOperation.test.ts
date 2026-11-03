import { describe, expect, it } from "vitest";
import { executeActionSchema } from "@/lib/api/schemas/actions";
import { playerActionOperationProperties } from "./playerActionOperation";

describe("bounded operation labels", () => {
  it.each([
    ["/api/country/US/parties", "party_create"],
    ["/api/country/US/parties/12/influence", "party_influence_national"],
    ["/api/country/US/region/CA/party/12/influence", "party_influence_regional"],
    ["/api/country/US/region/CA/party/12/recruitment", "party_recruitment_regional"],
    ["/api/country/US/region/CA/party/12/org-building", "party_org_building_regional"],
    ["/api/country/US/region/CA/party/12/leadership", "party_leadership_regional"],
    ["/api/country/US/region/CA/party/12/primary-allocation", "party_primary_allocation_regional"],
    ["/api/country/US/region/CA/party/12/build-org", "party_build_org_regional"],
    ["/api/country/US/region/CA/party/12/gotv", "party_gotv_regional"],
    ["/api/country/US/parties/12/recruitment/recruit", "party_recruitment_recruit_national"],
    ["/api/elections/abc/state-attack", "election_state_attack"],
    ["/api/elections/abc/running-mate/travel", "election_running_mate_travel"],
    ["/api/campaigns/abc/rally-tour", "campaign_rally_tour"],
    ["/api/canvassing", "campaign_canvassing"],
    ["/api/npps/abc/direct-action", "npp_direct_action"],
    ["/api/corporations/abc/sectors/def/abandon", "sector_abandon"],
  ])("labels only the fixed operation for %s", (path, operation) => {
    expect(
      playerActionOperationProperties(path, "POST", {
        actionType: "fundraise",
        operation: "private text",
      })
    ).toEqual({ action_operation: operation });
  });

  it.each(executeActionSchema.shape.actionType.options)(
    "captures reviewed execute action %s",
    (actionType) => {
      expect(
        playerActionOperationProperties("/api/actions/execute", "POST", { actionType })
      ).toEqual({ action_operation: "character_action_execute", requested_action: actionType });
    }
  );

  it.each([
    undefined,
    null,
    3,
    {},
    ["fundraise"],
    "private text",
    "constructor",
    "__proto__",
    "Fundraise",
  ])("does not forward unknown or malformed actionType %j", (actionType) => {
    expect(
      playerActionOperationProperties("/api/actions/execute", "POST", {
        actionType,
        action: "private text",
      })
    ).toEqual({ action_operation: "character_action_execute", requested_action: "unknown" });
  });

  it.each([
    ["/api/actions/execute", "GET"],
    ["/api/actions/execute", "PATCH"],
    ["/api/actions/execute/extra", "POST"],
    ["/api/actions/execute?private=text", "POST"],
    ["/api/country/US/parties/12/unknown-private-operation", "POST"],
    ["/api/country/US/parties/12/influence/extra", "POST"],
    ["/api/country/US/region/CA/party/12/influence", "DELETE"],
  ])("retains unknown coverage for %s %s", (path, method) => {
    expect(playerActionOperationProperties(path, method, { actionType: "fundraise" })).toEqual({
      action_operation: "unknown",
    });
  });
});
