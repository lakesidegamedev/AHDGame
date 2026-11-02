// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import type { SeatCycle } from "@/lib/campaignManager/rules";
import { PastRaces } from "./PastRaces";

afterEach(cleanup);

const dem = { partyId: "1", partyAbbr: "DEM", partyColor: "#2563eb" };
const cycles: SeatCycle[] = [
  {
    electionId: "e3",
    cycle: 3,
    year: 1994,
    state: "live",
    winner: null,
    margin: null,
    seatSplit: null,
    primaries: [{ ...dem, winnerName: "Ann Lee", margin: 12.5 }],
  },
  {
    electionId: "e2",
    cycle: 2,
    year: 1988,
    state: "final",
    winner: { name: "Don Riegle", ...dem },
    margin: 21.4,
    seatSplit: null,
    primaries: [],
  },
  {
    electionId: "e1",
    cycle: 1,
    year: 1982,
    state: "final",
    winner: null,
    margin: null,
    seatSplit: null,
    primaries: [],
  },
];

describe("PastRaces", () => {
  it("lists every other cycle with its winner", () => {
    renderWithElectionsMessages(<PastRaces cycles={cycles} currentId="e3" onOpen={() => {}} />);
    expect(screen.getByText("Past races for this seat")).toBeTruthy();
    expect(screen.getByText("Don Riegle (DEM)")).toBeTruthy();
    expect(screen.getByText("DEM +21.4")).toBeTruthy();
    expect(screen.getByText("No result recorded")).toBeTruthy();
  });

  it("marks the open cycle", () => {
    renderWithElectionsMessages(<PastRaces cycles={cycles} currentId="e2" onOpen={() => {}} />);
    const open = screen.getByRole("button", { name: /1988/ });
    expect(open.getAttribute("aria-current")).toBe("true");
  });

  it("opens a finished primary", () => {
    const onOpen = vi.fn();
    renderWithElectionsMessages(<PastRaces cycles={cycles} currentId="e2" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /DEM primary/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ electionId: "e3" }), "1");
  });

  it("says so when the seat has no other races", () => {
    renderWithElectionsMessages(
      <PastRaces cycles={[cycles[0]]} currentId="e3" onOpen={() => {}} />
    );
    expect(screen.getByText("No earlier races for this seat.")).toBeTruthy();
  });
});

describe("PastRaces with a cycle that cannot open yet", () => {
  it("lists it without making it clickable", () => {
    const upcoming: SeatCycle = {
      ...cycles[2],
      electionId: "e4",
      cycle: 4,
      year: 2000,
      state: "upcoming",
    };
    renderWithElectionsMessages(
      <PastRaces
        cycles={[upcoming, ...cycles]}
        currentId="e3"
        onOpen={() => {}}
        canOpen={(c) => c.state !== "upcoming"}
      />
    );
    const row = screen.getByRole("button", { name: /2000/ }) as HTMLButtonElement;
    expect(row.disabled).toBe(true);
  });
});

describe("PastRaces multi-seat", () => {
  it("shows the leading party's seats for a multi-seat cycle", () => {
    const multi: SeatCycle = {
      ...cycles[1],
      electionId: "m",
      winner: null,
      margin: null,
      seatSplit: { total: 52, parties: [{ ...dem, seats: 30 }] },
    };
    renderWithElectionsMessages(
      <PastRaces cycles={[cycles[0], multi]} currentId="e3" onOpen={() => {}} />
    );
    expect(screen.getByText("DEM won 30 of 52 seats")).toBeTruthy();
  });
});
