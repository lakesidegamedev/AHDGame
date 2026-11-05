/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FieldOfficeView } from "@/lib/campaigns/fieldOffices/queries";
import { FieldOfficeStatePanel } from "./FieldOfficeStatePanel";
import type { FieldOfficeLayer } from "./useFieldOfficeLayer";

const sub = (
  id: string,
  name: string,
  marginalPct: number | undefined,
  officeId: string | null
) => ({
  id,
  name,
  path: "M0,0L1,1Z",
  electorateShare: 0.2,
  basePvi: 4,
  livePvi: 6,
  yieldFactor: marginalPct != null ? 1.1 : undefined,
  marginalPct,
  officeId,
});

function view(over: Partial<FieldOfficeView> = {}): FieldOfficeView {
  return {
    enabled: true,
    scope: "county",
    canManage: true,
    raceActive: true,
    currentTurn: 10,
    rampTurns: 4,
    cap: 5,
    costs: { open: 1000, upkeep: 50, actions: 2, currency: "USD" },
    funds: 5000,
    actions: 6,
    regions: [{ id: "OH", name: "Ohio", officeCount: 1, effectPct: 0.8 }],
    offices: [
      {
        id: "o1",
        regionId: "OH",
        subdivisionId: "39049",
        label: "Franklin",
        openedTurn: 8,
        strength: 0.5,
      },
    ],
    selectedRegionId: "OH",
    map: {
      regionId: "OH",
      viewBox: "0 0 10 10",
      regionBasePvi: 3,
      regionLivePvi: 4,
      subdivisions: [
        sub("39049", "Franklin", 0.4, "o1"),
        sub("39035", "Cuyahoga", 0.9, null),
        sub("39061", "Hamilton", 0.6, null),
      ],
    },
    liveLeanYear: null,
    liveLeanPriorYear: null,
    liveLeanActive: false,
    leanSourceLabel: null,
    ...over,
  };
}

function layer(v: FieldOfficeView, over: Partial<FieldOfficeLayer> = {}): FieldOfficeLayer {
  return {
    campaignId: "c1",
    meta: v,
    regionView: v,
    loadError: null,
    selectedCounty: null,
    selectCounty: vi.fn(),
    busy: null,
    message: null,
    openOffice: vi.fn().mockResolvedValue(undefined),
    closeOffice: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

const panel = (
  l: FieldOfficeLayer,
  over: Partial<Parameters<typeof FieldOfficeStatePanel>[0]> = {}
) =>
  render(
    <FieldOfficeStatePanel
      layer={l}
      stateId="OH"
      stateName="Ohio"
      active
      listCounties={false}
      onShowOnMap={vi.fn()}
      {...over}
    />
  );

describe("FieldOfficeStatePanel", () => {
  it("shows the state's offices with Close for someone who may act", () => {
    const l = layer(view());
    panel(l);
    expect(screen.getByText("Field offices in Ohio")).toBeTruthy();
    expect(screen.getByText(/1 office, turnout boost \+0.80%/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close the Franklin office" }));
    expect(l.closeOffice).toHaveBeenCalledWith("o1", "Franklin");
  });

  it("gives a viewer who cannot manage offices and lean, with no actions or prices", () => {
    const v = view({ canManage: false, costs: null, funds: null, actions: null });
    const l = layer(v, { selectedCounty: "39035" });
    panel(l);
    expect(screen.getByText("Franklin")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Close the/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Open office/ })).toBeNull();
    expect(screen.getByTestId("field-office-county").textContent).toMatch(/Cuyahoga County/);
  });

  it("opens an office from the picked county's detail", () => {
    const l = layer(view(), { selectedCounty: "39035" });
    panel(l);
    const detail = screen.getByTestId("field-office-county");
    expect(detail.textContent).toMatch(/Share of state/);
    expect(detail.textContent).toMatch(/\+0.90% turnout statewide/);
    fireEvent.click(screen.getByRole("button", { name: /Open office · \$1,000/ }));
    expect(l.openOffice).toHaveBeenCalledWith("OH", "39035", "Cuyahoga County");
  });

  it("disables opening and says why when the war chest is short", () => {
    const l = layer(view({ funds: 10 }), { selectedCounty: "39035" });
    panel(l);
    expect(
      (screen.getByRole("button", { name: /Open office/ }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByText(/in the war chest/)).toBeTruthy();
  });

  it("offers Close on a county that holds an office", () => {
    const l = layer(view(), { selectedCounty: "39049" });
    panel(l);
    const detail = screen.getByTestId("field-office-county");
    expect(detail.textContent).toMatch(/OFFICE OPEN/);
    fireEvent.click(screen.getByRole("button", { name: "Close office" }));
    expect(l.closeOffice).toHaveBeenCalledWith("o1", "Franklin");
  });

  it("lists the best counties for a manager when the map is behind the panel", () => {
    const l = layer(view());
    panel(l, { active: false, listCounties: true });
    const top = screen.getByTestId("field-office-top");
    const names = Array.from(top.querySelectorAll("li")).map((li) => li.textContent);
    expect(names[0]).toMatch(/Cuyahoga/);
    expect(names[1]).toMatch(/Hamilton/);
    expect(top.textContent).not.toMatch(/Franklin/);
    fireEvent.click(screen.getByRole("button", { name: /Cuyahoga/ }));
    expect(l.selectCounty).toHaveBeenCalledWith("39035");
  });

  it("does not list opportunity to someone who cannot see prices", () => {
    const v = view({ canManage: false, costs: null });
    panel(
      layer({
        ...v,
        map: {
          ...v.map!,
          subdivisions: v.map!.subdivisions.map((s) => ({ ...s, marginalPct: undefined })),
        },
      }),
      {
        active: false,
        listCounties: true,
      }
    );
    expect(screen.queryByTestId("field-office-top")).toBeNull();
  });

  it("offers a way onto the map to a viewer who has no campaign link", () => {
    const onShow = vi.fn();
    panel(layer(view({ canManage: false, costs: null })), { active: false, onShowOnMap: onShow });
    fireEvent.click(screen.getByRole("button", { name: "Show counties on the map" }));
    expect(onShow).toHaveBeenCalled();
  });

  it("renders nothing when the country has no field offices or the state is unknown", () => {
    const { container } = panel(layer(view({ enabled: false })));
    expect(container.textContent).toBe("");
    const other = render(
      <FieldOfficeStatePanel
        layer={layer(view())}
        stateId="TX"
        stateName="Texas"
        active
        listCounties={false}
        onShowOnMap={vi.fn()}
      />
    );
    expect(other.container.textContent).toBe("");
  });
});
