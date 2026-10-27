/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegionHeader, type RegionHeaderProps } from "./RegionHeader";
vi.mock("@/components/RegionDropdown", () => ({ RegionDropdown: () => null }));
vi.mock("@/components/RelocateButton", () => ({ RelocateButton: () => null }));
vi.mock("@/components/BackButton", () => ({ default: () => null }));
vi.mock("@/components/HeroImage", () => ({ HeroImage: () => null }));
vi.mock("@/components/Avatar", () => ({ Avatar: () => null }));
afterEach(cleanup);
describe("Regional hero legislature shortcut", () => {
  const props: RegionHeaderProps = {
    regionId: "SCO",
    regionName: "Scotland",
    countryId: "UK",
    countryName: "United Kingdom",
    countryHref: "/country/uk",
    regionHref: "/country/uk/region/SCO",
    descriptor: "Scotland",
    flagSrc: null,
    bannerSrc: null,
    population: "4.9M",
    gdp: "£104B",
    districts: { label: "Districts", count: 57 },
    leans: null,
    approval: null,
    executiveLabel: "First Minister",
    executive: null,
    officeHref: null,
    legislature: { href: "/country/uk/region/SCO/legislature", label: "Scottish Parliament" },
    motto: null,
    comprising: null,
    relocate: {},
    currentParty: null,
  };
  it("remains public when the office is vacant and inaccessible", () => {
    render(<RegionHeader {...props} />);
    expect(screen.getByRole("link", { name: "Scottish Parliament" }).getAttribute("href")).toBe(
      props.legislature?.href
    );
    expect(screen.queryByRole("link", { name: "Office" })).toBeNull();
  });
  it("sits beside the office shortcut for an occupied office", () => {
    render(
      <RegionHeader
        {...props}
        officeHref="/country/uk/region/SCO/office"
        executive={{
          characterId: "507f1f77bcf86cd799439011",
          characterName: "First Minister",
          partyAbbreviation: null,
          partyColor: null,
          avatarUrl: null,
          borderKey: null,
          tintColor: null,
          nppId: null,
          characterSequentialId: null,
          nppSequentialId: null,
        }}
      />
    );
    const office = screen.getByRole("link", { name: "Office" });
    const legislature = screen.getByRole("link", { name: "Scottish Parliament" });
    expect(office.parentElement).toBe(legislature.parentElement);
  });
  it("does not invent a legislature shortcut for a country without one", () => {
    render(<RegionHeader {...props} legislature={null} />);
    expect(screen.queryByRole("link", { name: "Scottish Parliament" })).toBeNull();
  });
});
