/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UKRegionClient from "./UKRegionClient";
import { UK_REGIONS } from "@/lib/constants/uk";
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
      expect(screen.queryByRole("link", { name: "Office →" }) !== null).toBe(canManageOffice);
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
});
