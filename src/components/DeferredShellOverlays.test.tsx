// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  hasSession: false,
  needsStatAllocation: false,
  needsWealthTierRepick: false,
  pendingSeasonRecapId: null as string | null,
}));

vi.mock("@/contexts/AuthDataContext", () => ({
  useHasSession: () => auth.hasSession,
  useOptionalAuthMe: () => ({
    user: auth.hasSession ? { character: auth } : null,
    navData: { pendingSeasonRecapId: auth.pendingSeasonRecapId },
  }),
}));

vi.mock("@/components/stats/StatAllocationGate", () => ({
  StatAllocationGate: () => <div>Stats</div>,
}));
vi.mock("@/components/character/WealthTierRepickGate", () => ({
  WealthTierRepickGate: () => <div>Wealth</div>,
}));
vi.mock("@/components/recap/SeasonRecapGate", () => ({
  SeasonRecapGate: () => <div>Recap</div>,
}));
vi.mock("@/components/tutorial/TutorialCoachMount", () => ({
  TutorialCoachMount: () => <div>Tutorial</div>,
}));
vi.mock("@/components/cabinet/NominationChoicePrompt", () => ({
  NominationChoicePrompt: () => <div>Nomination</div>,
}));

import {
  DeferredNominationChoicePrompt,
  DeferredSeasonRecapGate,
  DeferredStatAllocationGate,
  DeferredTutorialCoachMount,
  DeferredWealthTierRepickGate,
} from "./DeferredShellOverlays";

function ShellGates() {
  return (
    <>
      <DeferredStatAllocationGate />
      <DeferredWealthTierRepickGate />
      <DeferredSeasonRecapGate />
      <DeferredTutorialCoachMount />
      <DeferredNominationChoicePrompt />
    </>
  );
}

beforeEach(() => {
  auth.hasSession = false;
  auth.needsStatAllocation = false;
  auth.needsWealthTierRepick = false;
  auth.pendingSeasonRecapId = null;
});
afterEach(cleanup);

describe("deferred shell gates", () => {
  it("keeps signed-in overlays out of anonymous page loads", () => {
    expect(render(<ShellGates />).container.children).toHaveLength(0);
  });

  it("loads each gate when eligible and keeps already opened gates mounted", async () => {
    const view = render(<ShellGates />);
    auth.hasSession = true;
    view.rerender(<ShellGates />);
    await waitFor(() => {
      expect(view.getByText("Tutorial")).toBeTruthy();
      expect(view.getByText("Nomination")).toBeTruthy();
      expect(view.container.children).toHaveLength(2);
    });

    auth.needsStatAllocation = true;
    auth.needsWealthTierRepick = true;
    auth.pendingSeasonRecapId = "recap";
    view.rerender(<ShellGates />);
    const recap = await view.findByText("Recap");
    const stats = await view.findByText("Stats");
    const wealth = await view.findByText("Wealth");

    auth.needsStatAllocation = false;
    auth.needsWealthTierRepick = false;
    auth.pendingSeasonRecapId = null;
    view.rerender(<ShellGates />);
    expect(view.getByText("Stats")).toBe(stats);
    expect(view.getByText("Wealth")).toBe(wealth);
    expect(view.getByText("Recap")).toBe(recap);
  });
});
