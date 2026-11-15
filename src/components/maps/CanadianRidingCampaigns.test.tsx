// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CanadianRidingCampaigns } from "./CanadianRidingCampaigns";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Canadian riding campaign control", () => {
  it("submits the displayed election and versioned riding and refreshes after success", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ boost: 2.5, psCost: 2 }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const refresh = vi.fn();
    render(
      <CanadianRidingCampaigns
        electionId="ballot"
        stateId="CA_ON"
        partyId="1"
        ridings={[{ id: "CA-FED-2023-35001", name: "Ajax" }]}
        onCampaign={refresh}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Campaign Here" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    const [url, request] = fetch.mock.calls[0];
    expect(url).toContain("/country/ca/region/CA_ON/party/1/campaign");
    expect(JSON.parse(request.body)).toEqual({
      electionId: "ballot",
      ridingId: "CA-FED-2023-35001",
      planVersion: "2023",
      districtIndex: 35001,
    });
    expect(screen.getByRole("status").textContent).toContain("2 political strength");
  });
});
