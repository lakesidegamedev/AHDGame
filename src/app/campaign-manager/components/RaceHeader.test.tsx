// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import { buildRaceIndex } from "@/lib/campaignManager/rules";
import { election } from "@/lib/campaignManager/rules/__fixtures__/election";
import { RaceHeader } from "./RaceHeader";
import { RaceEntryButtons } from "./RaceEntryButtons";

afterEach(cleanup);

const race = buildRaceIndex(
  [
    election({
      id: "p",
      inPrimary: true,
      inGeneral: false,
      byParty: [
        { partyId: "1", partyName: "Party 1", partyColor: "#2563eb", candidates: [] },
      ] as never,
    }),
  ],
  { currentTurn: 10, nationalChamberKeys: ["senate"] }
)[0];

function header(entry: { canEnter: boolean; canWithdraw: boolean }) {
  const onEnter = vi.fn();
  const onWithdraw = vi.fn();
  renderWithElectionsMessages(
    <RaceHeader
      race={race}
      countryId="US"
      regionNames={{ OH: "Ohio" }}
      watched={false}
      onToggleWatch={() => {}}
      entry={<RaceEntryButtons {...entry} busy={false} onEnter={onEnter} onWithdraw={onWithdraw} />}
    />
  );
  return { onEnter, onWithdraw };
}

describe("RaceHeader entry", () => {
  it("shows Enter race and calls enter", () => {
    const { onEnter } = header({ canEnter: true, canWithdraw: false });
    fireEvent.click(screen.getByRole("button", { name: "Enter race" }));
    expect(onEnter).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });

  it("shows Withdraw for your own race", () => {
    const { onWithdraw } = header({ canEnter: false, canWithdraw: true });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(onWithdraw).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Enter race" })).toBeNull();
  });

  it("shows neither when the player can do neither", () => {
    header({ canEnter: false, canWithdraw: false });
    expect(screen.queryByRole("button", { name: "Enter race" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });
});
