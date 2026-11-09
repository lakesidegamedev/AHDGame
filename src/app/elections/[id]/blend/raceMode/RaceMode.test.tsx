/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PresidentialStage } from "../PresidentialStage";
import { RaceModeProvider } from "./RaceModeContext";
import { RaceModeSwitch } from "./RaceModeSwitch";

let query = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query),
}));

function stage(slots: Parameters<typeof RaceModeProvider>[0]["value"]) {
  return render(
    <RaceModeProvider value={slots}>
      <PresidentialStage
        title="The 1992 Presidential Election"
        ticker={<div>wire ticker</div>}
        strip={<div>college snake</div>}
        nav={<div>cycle nav</div>}
        left={<div>scoreboard</div>}
        right={<div>context rail</div>}
        map={<div>national map</div>}
      />
    </RaceModeProvider>
  );
}

describe("PresidentialStage modes", () => {
  it("shows the race body when there is no campaign to show", () => {
    stage(null);
    expect(screen.getByText("national map")).toBeTruthy();
    expect(screen.getByText("scoreboard")).toBeTruthy();
    expect(screen.queryByTestId("campaign-mode")).toBeNull();
  });

  it("keeps the switch beside the title in Race mode", () => {
    stage({ switcher: <span>the switch</span>, campaign: null, desk: null, mapAbove: false });
    expect(screen.getByText("the switch")).toBeTruthy();
    expect(screen.getByText("national map")).toBeTruthy();
  });

  it("swaps the race body for the workspace in Campaign mode and keeps the stage", () => {
    stage({
      switcher: <span>the switch</span>,
      campaign: <div>campaign desk</div>,
      desk: null,
      mapAbove: false,
    });
    expect(screen.getByTestId("campaign-mode").textContent).toBe("campaign desk");
    expect(screen.getByText("The 1992 Presidential Election")).toBeTruthy();
    expect(screen.getByText("wire ticker")).toBeTruthy();
    expect(screen.getByText("cycle nav")).toBeTruthy();
    expect(screen.getByText("the switch")).toBeTruthy();
    expect(screen.queryByText("national map")).toBeNull();
    expect(screen.queryByText("scoreboard")).toBeNull();
    expect(screen.queryByText("college snake")).toBeNull();
  });
});

describe("PresidentialStage Campaign mode map", () => {
  it("keeps the map above the workspace when the map is the way into a state", () => {
    stage({
      switcher: null,
      campaign: <div>campaign desk</div>,
      desk: null,
      mapAbove: true,
    });
    const map = screen.getByTestId("campaign-map");
    expect(map.textContent).toBe("national map");
    const desk = screen.getByTestId("campaign-mode");
    // The map comes first in the page, then the workspace.
    expect(map.compareDocumentPosition(desk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("scoreboard")).toBeNull();
  });

  it("leaves the workspace alone for a race without the map entry", () => {
    stage({ switcher: null, campaign: <div>campaign desk</div>, desk: null, mapAbove: false });
    expect(screen.queryByTestId("campaign-map")).toBeNull();
    expect(screen.queryByText("national map")).toBeNull();
  });
});

describe("RaceModeSwitch", () => {
  it("links each mode to the same page with the view set and the rest kept", () => {
    query = "view=campaign&campaign=6ae803d32a6841f128efd90d&tab=field&region=OH&cycle=2";
    render(<RaceModeSwitch mode="campaign" />);
    const race = screen.getByRole("link", { name: "Race" });
    const campaign = screen.getByRole("link", { name: "Campaign" });
    const raceQuery = new URLSearchParams(race.getAttribute("href")!.slice(1));
    expect(raceQuery.get("view")).toBe("race");
    expect(raceQuery.get("cycle")).toBe("2");
    expect(raceQuery.has("tab")).toBe(false);
    expect(new URLSearchParams(campaign.getAttribute("href")!.slice(1)).get("view")).toBe(
      "campaign"
    );
    expect(campaign.getAttribute("aria-current")).toBe("page");
    expect(race.getAttribute("aria-current")).toBeNull();
  });
});
