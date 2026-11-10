// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { render, screen, cleanup } from "@testing-library/react";
import { NavairCommandClient, type CommandFormation } from "./NavairCommandClient";

afterEach(cleanup);

/**
 * What the command page says about repair.
 *
 * A formation's condition has always been shown as a bare percentage, which tells a
 * commander what is wrong and nothing about what to do. These lines exist to name the
 * rate, the limit and the reason, because "not mending" on its own sends a player to the
 * wiki while "your supply is below what a yard needs" sends them to move the fleet.
 */

const formation = (over: Partial<CommandFormation> = {}): CommandFormation => ({
  id: "f1",
  name: "1st Test Squadron",
  type: "Guided-Missile Destroyer",
  domain: "naval",
  station: "weu",
  stationName: "Western Europe",
  mission: "PORT",
  missionTarget: null,
  integrity: 40,
  readiness: 70,
  supply: 100,
  auto: false,
  warnings: [],
  repair: { mending: true, text: "Mending 12% a turn in port, up to 100%." },
  ...over,
});

const props = {
  conflictsEnabled: true,
  countryCode: "uk",
  positionId: "defence_secretary",
  summary: {
    holding: [],
    frontsWithoutAir: [],
    starving: 0,
    atWar: true,
    navalLots: 0,
    airLots: 0,
  },
  navalMissions: [{ key: "PORT", label: "In port", desc: "Resting." }],
  airMissions: [],
  stations: [{ id: "weu", name: "Western Europe", allowed: true }],
};

describe("NavairCommandClient repair", () => {
  it("says what a mending formation is recovering and how far", () => {
    render(<NavairCommandClient {...props} formations={[formation()]} />);
    expect(screen.getByText("Mending 12% a turn in port, up to 100%.")).toBeDefined();
  });

  it("says why a formation is not mending", () => {
    render(
      <NavairCommandClient
        {...props}
        formations={[
          formation({ repair: { mending: false, text: "Not mending: fought this turn." } }),
        ]}
      />
    );
    expect(screen.getByText("Not mending: fought this turn.")).toBeDefined();
  });

  // A commander cannot act on paid repair without knowing whether there is anything in
  // the store to pay with.
  it("names the materiel available for paid repair", () => {
    render(
      <NavairCommandClient
        {...props}
        summary={{ ...props.summary, navalLots: 12, airLots: 3 }}
        formations={[formation()]}
      />
    );
    expect(screen.getByText(/12 naval/)).toBeDefined();
  });

  // A wing is not in a yard and does not put into port. Same rates, different words.
  it("uses air wording for a wing and naval wording for a hull", () => {
    render(
      <NavairCommandClient
        {...props}
        formations={[
          formation({
            id: "a",
            repair: { mending: true, text: "Mending 12% a turn at a home base, up to 100%." },
          }),
          formation({
            id: "b",
            repair: { mending: true, text: "Mending 12% a turn in a home yard, up to 100%." },
          }),
        ]}
      />
    );
    expect(screen.getByText(/at a home base/)).toBeDefined();
    expect(screen.getByText(/in a home yard/)).toBeDefined();
  });

  it("says plainly when there is no materiel for paid repair", () => {
    render(<NavairCommandClient {...props} formations={[formation()]} />);
    expect(screen.getByText(/no naval or air materiel in store/i)).toBeDefined();
  });

  it("shows formations as read-only while conflicts is disabled", () => {
    render(<NavairCommandClient {...props} conflictsEnabled={false} formations={[formation()]} />);

    expect(screen.getByRole("status").textContent).toMatch(/Conflicts is disabled/);
    expect(screen.getByText("1st Test Squadron")).toBeDefined();
    const controls = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((control) => control.disabled)).toBe(true);
  });
});

describe("NavairCommandClient station labels", () => {
  const stations = [
    { id: "weu", name: "Western Europe", allowed: true },
    { id: "nam", name: "North America", allowed: false, blockedReason: "land" as const },
    { id: "cas", name: "Central Asia", allowed: false, blockedReason: "no-port" as const },
  ];

  it("does not call a land region with a port rating 'no port'", () => {
    render(<NavairCommandClient {...props} stations={stations} formations={[formation()]} />);
    const nam = screen
      .getAllByRole("option")
      .find((o) => /North America/.test(o.textContent ?? ""));
    expect(nam?.textContent).not.toMatch(/no port/);
    expect(nam?.textContent).toMatch(/land region/);
    expect((nam as HTMLOptionElement).disabled).toBe(true);
  });

  it("still says landlocked for a region with no port", () => {
    render(<NavairCommandClient {...props} stations={stations} formations={[formation()]} />);
    const cas = screen.getAllByRole("option").find((o) => /Central Asia/.test(o.textContent ?? ""));
    expect(cas?.textContent).toMatch(/landlocked, no port/);
  });

  it("adds no suffix to an allowed region", () => {
    render(<NavairCommandClient {...props} stations={stations} formations={[formation()]} />);
    const weu = screen.getAllByRole("option").find((o) => o.textContent === "Western Europe");
    expect(weu).toBeDefined();
  });
});
