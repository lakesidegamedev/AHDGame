/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ResourceCapacityPanel from "./ResourceCapacityPanel";

vi.mock("@/hooks/useProspectingSurveys", () => ({
  useProspectingSurveys: () => ({ surveys: [], loading: false, refresh: vi.fn() }),
}));
vi.mock("@/components/extraction/ProspectingSurveyList", () => ({
  ProspectingSurveyList: () => <div>survey list</div>,
}));
vi.mock("./ProspectModal", () => ({ default: () => <div>prospect modal</div> }));

const baseProps = {
  stateResources: { oil: 1000 },
  stateId: "TX",
  countryId: "US",
  corpId: "corp1",
  isCeo: true,
  prospectingEnabled: true,
};

describe("ResourceCapacityPanel prospect action", () => {
  it("offers Prospect to a CEO of a company that is allowed to prospect", () => {
    render(<ResourceCapacityPanel {...baseProps} corpCanProspect />);
    expect(screen.getAllByRole("button", { name: "Prospect" }).length).toBeGreaterThan(0);
  });

  it("hides Prospect from a CEO whose company type is not extraction", () => {
    render(<ResourceCapacityPanel {...baseProps} corpCanProspect={false} />);
    expect(screen.queryByRole("button", { name: "Prospect" })).toBeNull();
    expect(screen.queryByText("survey list")).toBeNull();
  });

  it("hides Prospect from a non-CEO even when the company is allowed", () => {
    render(<ResourceCapacityPanel {...baseProps} isCeo={false} corpCanProspect />);
    expect(screen.queryByRole("button", { name: "Prospect" })).toBeNull();
  });
});
