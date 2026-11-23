/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { State } from "@/lib/db/types";
import type { SerializedOfficial } from "../StatePageTabsTypes";
import { GovernorSection, SenateSection, StateSenateSection } from "./OfficialsSection";

describe("SenateSection", () => {
  it("explains an unelected national council instead of asking admins to seed two senators", () => {
    render(
      <SenateSection
        state={{ countryId: "DD" } as State}
        senators={[]}
        label="Staatsrat"
        isElected={false}
        configuredSeats={25}
        description="The collective head of state acting between Volkskammer sessions."
      />
    );

    expect(screen.getByText("25 members · unelected")).toBeTruthy();
    expect(
      screen.getByText("The collective head of state acting between Volkskammer sessions.")
    ).toBeTruthy();
    expect(screen.queryByText("2 seats")).toBeNull();
    expect(screen.queryByText(/Admin needs to initialize/)).toBeNull();
  });

  it("counts the region's own seats, not the national chamber size", () => {
    const senators = [
      { _id: "s1", characterName: "Bob Casey Jr.", nppId: "n1", isNPP: true, senateClass: 1 },
      { _id: "s2", characterName: "Pat Toomey", nppId: "n2", isNPP: true, senateClass: 3 },
    ] as unknown as SerializedOfficial[];
    render(
      <SenateSection
        state={{ countryId: "US", houseDistricts: 17 } as State}
        senators={senators}
        configuredSeats={100}
      />
    );

    expect(screen.getByText("2 seats")).toBeTruthy();
    expect(screen.queryByText("100 seats")).toBeNull();
    expect(screen.getByText("Senator, Class 1")).toBeTruthy();
  });
});

describe("empty and country-specific chambers", () => {
  it("tells players an empty chamber has no seated members, not that an admin must act", () => {
    render(<SenateSection state={{ countryId: "US" } as State} senators={[]} />);
    expect(screen.queryByText(/Admin needs to initialize/)).toBeNull();
    expect(screen.getByText(/No senate members are seated/)).toBeTruthy();
  });

  it("labels provincial legislators with the country's own office title", () => {
    const members = [
      { _id: "m1", characterName: "Jo Park", nppId: "n1", isNPP: true },
    ] as unknown as SerializedOfficial[];
    render(
      <StateSenateSection
        state={{ countryId: "CA" } as State}
        stateSenators={members}
        label="Provincial Legislature"
        memberTitle="Member of the Provincial Legislature"
      />
    );
    expect(screen.queryByText(/State senator/)).toBeNull();
    expect(screen.getByText(/Member of the Provincial Legislature/)).toBeTruthy();
  });

  it("explains on the premier card that premiers are elected apart from the legislature", () => {
    render(
      <GovernorSection
        state={{ countryId: "CA", _id: "CA_SK" } as State}
        governor={null}
        label="Premier"
        note="The premier is elected in a separate vote from the legislature."
      />
    );
    expect(screen.getByText(/elected in a separate vote/)).toBeTruthy();
  });
});
