/** @vitest-environment happy-dom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PartyCommitteeTitlesControl } from "./PartyCommitteeTitlesControl";

afterEach(() => vi.unstubAllGlobals());

describe("PartyCommitteeTitlesControl", () => {
  it("saves the name, default and individual override while keeping blank titles on the default", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onUpdate = vi.fn();
    render(
      <PartyCommitteeTitlesControl
        partyId="1"
        countryId="US"
        titles={{ byMember: { first: "Old Title" } }}
        members={[
          { id: "first", name: "Taylor Lane" },
          { id: "second", name: "Casey Morgan" },
        ]}
        onUpdate={onUpdate}
      />
    );

    expect(screen.getByLabelText("Default member title").getAttribute("placeholder")).toBe(
      "Committeeman"
    );
    fireEvent.change(screen.getByLabelText("Committee name"), {
      target: { value: "National Council" },
    });
    fireEvent.change(screen.getByLabelText("Default member title"), {
      target: { value: "Councillor" },
    });
    fireEvent.change(screen.getByLabelText("Title for Taylor Lane"), { target: { value: " " } });
    fireEvent.change(screen.getByLabelText("Title for Casey Morgan"), {
      target: { value: "Rules Convenor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save committee titles" }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/country/us/parties/1/settings",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          committeeTitles: {
            name: "National Council",
            member: "Councillor",
            byMember: { first: null, second: "Rules Convenor" },
          },
        }),
      })
    );
  });
});
