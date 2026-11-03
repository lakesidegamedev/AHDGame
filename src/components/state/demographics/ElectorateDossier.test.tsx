/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { getBucketProfileForRegion } from "@/lib/demographics/bucketProfile";
import { withLegislativePriorities } from "@/lib/demographics/legislativePriorities/profile";
import { ElectorateDossier } from "./ElectorateDossier";

afterEach(cleanup);

describe("electorate legislative priorities", () => {
  it.each([
    ["US", "TX"],
    ["UK", "SCO"],
    ["JP", "KAN"],
  ])("%s: displays exact law levels below leans in both views", (cc, region) => {
    const profile = withLegislativePriorities(
      getBucketProfileForRegion(cc, region, "1953-default"),
      cc,
      region
    )!;
    render(<ElectorateDossier profile={profile} regionParties={[]} />);
    const selected = [...profile[0].buckets]
      .filter((b) => b.sharePct > 0)
      .sort((a, b) => b.sharePct - a.sharePct)[0];
    const priorities = selected.legislativePriorities!;
    const panel = screen.getByRole("region", { name: "Legislative priorities" });
    expect(within(panel).getByText("Primary")).toBeTruthy();
    expect(within(panel).getByText("Secondary")).toBeTruthy();
    expect(within(panel).getAllByRole("listitem")).toHaveLength(3);
    for (const request of [priorities.primary, ...priorities.secondary]) {
      expect(within(panel).getByText(request.lawName)).toBeTruthy();
      expect(within(panel).getByText(`Desired level: ${request.policyOptionName}`)).toBeTruthy();
    }
    expect(
      screen.getByText("Social lean").compareDocumentPosition(panel) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "analyst" }));
    expect(screen.getByRole("region", { name: "Legislative priorities" })).toBeTruthy();
  });

  it("updates the requests when the player selects another group or dimension", () => {
    const profile = withLegislativePriorities(
      getBucketProfileForRegion("US", "CA", "1953-default"),
      "US",
      "CA"
    )!;
    render(<ElectorateDossier profile={profile} regionParties={[]} />);
    const age = profile.find((s) => s.dim === "age")!;
    fireEvent.click(screen.getByRole("button", { name: age.dimLabel }));
    const senior = age.buckets.find((b) => b.id === "age:senior")!;
    fireEvent.click(screen.getByRole("button", { name: new RegExp(senior.label) }));
    const panel = screen.getByRole("region", { name: "Legislative priorities" });
    expect(within(panel).getByText(senior.legislativePriorities!.primary.lawName)).toBeTruthy();
    expect(within(panel).getByText("Desired level: Benefit Protection Act")).toBeTruthy();
    expect(within(panel).queryByText("State Affordable Housing Act")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Income" }));
    expect(screen.getByRole("region", { name: "Legislative priorities" })).toBeTruthy();
  });

  it("leaves the priority panel absent when no priorities are supplied", () => {
    render(
      <ElectorateDossier
        profile={getBucketProfileForRegion("US", "CA", "1953-default")!}
        regionParties={[]}
      />
    );
    expect(screen.queryByRole("region", { name: "Legislative priorities" })).toBeNull();
    expect(screen.getByText("Economic lean")).toBeTruthy();
  });
});
