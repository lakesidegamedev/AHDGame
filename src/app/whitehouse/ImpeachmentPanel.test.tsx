/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImpeachmentPanel from "./ImpeachmentPanel";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ impeachments: [], canFileViaPartyNpp: true }),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("NPP impeachment filing", () => {
  it.each(["governor", "president"] as const)(
    "submits the explicit party filing mode for %s",
    async (office) => {
      render(
        <ImpeachmentPanel
          countryId="US"
          office={office}
          state="NY"
          targetCharacterId="000000000000000000000001"
          targetName="Executive"
          isViewerTarget={false}
        />
      );
      const button = await screen.findByRole("button", {
        name: "File articles through party legislator",
      });
      fireEvent.click(button);
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/impeachments",
          expect.objectContaining({ method: "POST" })
        )
      );
      const options = fetchMock.mock.calls.find(([, options]) => options?.method === "POST")?.[1];
      expect(JSON.parse(options.body)).toMatchObject({ countryId: "US", proposeViaPartyNpp: true });
      if (office === "governor")
        expect(JSON.parse(options.body)).toMatchObject({ office: "governor", state: "NY" });
      else expect(JSON.parse(options.body).targetCharacterId).toBe("000000000000000000000001");
    }
  );
  it("does not offer the party button without server authorization", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ impeachments: [], canFileViaPartyNpp: false }),
    });
    render(
      <ImpeachmentPanel
        countryId="US"
        office="governor"
        state="NY"
        targetName="Governor"
        isViewerTarget={false}
      />
    );
    await screen.findByText(/No case open/);
    expect(
      screen.queryByRole("button", { name: "File articles through party legislator" })
    ).toBeNull();
    expect(screen.getByRole("button", { name: "File articles of impeachment" })).toBeTruthy();
  });
  it("disables both filing routes and explains the post-election wait", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        impeachments: [],
        canFileViaPartyNpp: true,
        filingWindow: { eligibleOnTurn: 172, remainingTurns: 22 },
      }),
    });
    render(
      <ImpeachmentPanel
        countryId="US"
        office="governor"
        state="NY"
        targetName="Governor"
        isViewerTarget={false}
      />
    );
    expect(await screen.findByText(/filing opens on turn 172, in 22 turns/)).toBeTruthy();
    for (const name of ["File articles of impeachment", "File articles through party legislator"])
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("publicly identifies the NPP filer and requesting player on the vote", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        impeachments: [
          {
            _id: "case",
            stage: "senate",
            targetName: "Governor",
            filedByName: "Senator Example",
            filedByNppId: "npp",
            requestedByName: "Chair Example",
            senateVotesFor: 0,
            senateVotesAgainst: 0,
            senateVotesAbstain: 0,
            senateVotingEndsOnTurn: 124,
          },
        ],
      }),
    });
    render(
      <ImpeachmentPanel
        countryId="US"
        office="governor"
        state="NY"
        targetName="Governor"
        isViewerTarget={false}
      />
    );
    expect(await screen.findByText("Senator Example")).toBeTruthy();
    expect(screen.getByText(/at the request of Chair Example/)).toBeTruthy();
  });
  it("does not offer filing against the viewer", async () => {
    render(
      <ImpeachmentPanel
        countryId="US"
        office="governor"
        state="NY"
        targetName="Governor"
        isViewerTarget
      />
    );
    await screen.findByText(/No case open/);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("surfaces a server rejection without claiming a case was filed", async () => {
    fetchMock.mockImplementation(async (_url, options) =>
      options?.method === "POST"
        ? { ok: false, json: async () => ({ error: "No eligible party legislator is available." }) }
        : { ok: true, json: async () => ({ impeachments: [], canFileViaPartyNpp: true }) }
    );
    render(
      <ImpeachmentPanel
        countryId="US"
        office="governor"
        state="NY"
        targetName="Governor"
        isViewerTarget={false}
      />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "File articles through party legislator" })
    );
    expect(await screen.findByText(/No eligible party legislator/)).toBeTruthy();
    expect(screen.queryByText("Articles of impeachment filed.")).toBeNull();
  });
});
