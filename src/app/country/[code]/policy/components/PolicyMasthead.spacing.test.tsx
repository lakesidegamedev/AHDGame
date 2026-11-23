// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PolicyMasthead } from "./PolicyMasthead";

// Round-three walkthrough reported "114statutes·12titles". The rendered DOM
// keeps the spaces; the report came from joining trimmed text nodes.
describe("PolicyMasthead count chip spacing", () => {
  it("renders the statute and title counts with their spaces", () => {
    const { container } = render(
      <PolicyMasthead
        countryId="US"
        statuteCount={114}
        titleCount={12}
        lastEnactedStamp={null}
        axes={null}
        view="code"
        onViewChange={() => {}}
      />
    );
    expect(container.textContent).toContain("114 statutes · 12 titles");
  });

  it("counts tariffs and subsidies separately so the titles add up", () => {
    const { container } = render(
      <PolicyMasthead
        countryId="US"
        statuteCount={131}
        tariffSubsidyCount={1}
        titleCount={13}
        lastEnactedStamp={null}
        axes={null}
        view="code"
        onViewChange={() => {}}
      />
    );
    expect(container.textContent).toContain("131 statutes + 1 tariff or subsidy · 13 titles");
  });

  it("names the source of the Social figure", () => {
    const axes = { economic: 0.2, social: -1.5 } as never;
    const withPosition = render(
      <PolicyMasthead
        countryId="US"
        statuteCount={3}
        titleCount={1}
        lastEnactedStamp={null}
        axes={axes}
        socialAxisPosition={0.54}
        view="code"
        onViewChange={() => {}}
      />
    );
    expect(withPosition.container.textContent).toContain("(country position)");
    const without = render(
      <PolicyMasthead
        countryId="US"
        statuteCount={3}
        titleCount={1}
        lastEnactedStamp={null}
        axes={axes}
        view="code"
        onViewChange={() => {}}
      />
    );
    expect(without.container.textContent).toContain("(average of enacted laws)");
  });
});
