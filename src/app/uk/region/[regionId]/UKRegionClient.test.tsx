/** @vitest-environment happy-dom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UKRegionClient from "./UKRegionClient";
import { getUKCouncilName, UK_REGIONS } from "@/lib/constants/uk";
import { regionUrl } from "@/lib/urls";
vi.mock("@/components/RegionDropdown", () => ({ RegionDropdown: () => null }));
vi.mock("@/components/RelocateButton", () => ({ RelocateButton: () => null }));
vi.mock("@/components/BackButton", () => ({ default: () => null }));
vi.mock("@/components/HeroImage", () => ({ HeroImage: () => null }));
vi.mock("@/components/uk/UKRegionPageTabs", () => ({ UKRegionPageTabs: () => null }));
afterEach(cleanup);
describe("UK regional hero legislature navigation", () => {
  const props = {
    region: UK_REGIONS.find((region) => region.id === "SCO")!,
    nation: null,
    state: null,
    demographics: null,
    categories: [],
    censusData: null,
    partyOrg: [],
    calculatedLeans: null,
    governmentApproval: null,
  };
  it.each([true, false])(
    "links Scotland's parliament beside the office area (office access=%s)",
    (canManageOffice) => {
      render(
        <UKRegionClient
          {...props}
          executiveLabel="First Minister"
          canManageOffice={canManageOffice}
        />
      );
      expect(screen.getByRole("link", { name: "Scottish Parliament" }).getAttribute("href")).toBe(
        regionUrl("UK", "SCO") + "/legislature"
      );
      const actions = screen.getByRole("navigation", { name: "Regional government" });
      expect(within(actions).queryByRole("link", { name: "Office" }) !== null).toBe(
        canManageOffice
      );
      expect(within(actions).getByRole("link", { name: "Scottish Parliament" })).toBeTruthy();
      expect(actions.closest(".overflow-x-auto")).toBeNull();
    }
  );
  it("also links a regional council when there is no devolved executive", () => {
    render(
      <UKRegionClient {...props} region={UK_REGIONS.find((region) => region.id === "SEE")!} />
    );
    expect(screen.getByRole("link", { name: "Regional Council" }).getAttribute("href")).toBe(
      regionUrl("UK", "SEE") + "/legislature"
    );
  });
  it.each(UK_REGIONS.map((region) => [region.id, region] as const))(
    "keeps %s legislature navigation outside scrolling statistics",
    (_id, region) => {
      render(<UKRegionClient {...props} region={region} />);
      const actions = screen.getByRole("navigation", { name: "Regional government" });
      expect(
        within(actions)
          .getByRole("link", { name: getUKCouncilName(region.id) })
          .getAttribute("href")
      ).toBe(regionUrl("UK", region.id) + "/legislature");
      expect(actions.closest("header")).not.toBeNull();
      expect(actions.closest(".overflow-x-auto")).toBeNull();
      expect(actions.classList.contains("flex-wrap")).toBe(true);
    }
  );
});
