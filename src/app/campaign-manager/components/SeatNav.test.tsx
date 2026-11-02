// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import type { SeatCycle } from "@/lib/campaignManager/rules";
import { SeatNav } from "./SeatNav";

afterEach(cleanup);

const cycle = (n: number, year: number, state: SeatCycle["state"] = "final"): SeatCycle => ({
  electionId: `e${n}`,
  cycle: n,
  year,
  state,
  winner: null,
  margin: null,
  seatSplit: null,
  primaries: [],
});

describe("SeatNav", () => {
  it("steps to the previous cycle", () => {
    const onOpen = vi.fn();
    renderWithElectionsMessages(
      <SeatNav prev={cycle(1, 1988)} next={cycle(3, 2000)} onOpen={onOpen} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous race, 1988" }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ electionId: "e1" }));
    expect(screen.getByRole("button", { name: "Next race, 2000" })).toBeTruthy();
  });

  it("disables Next on the newest cycle", () => {
    renderWithElectionsMessages(<SeatNav prev={cycle(1, 1988)} next={null} onOpen={() => {}} />);
    const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });
});
