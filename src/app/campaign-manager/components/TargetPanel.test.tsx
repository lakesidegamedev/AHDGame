// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithElectionsMessages } from "@/lib/test-utils/renderWithElectionsMessages";
import { buildRaceIndex } from "@/lib/campaignManager/rules";
import { election } from "@/lib/campaignManager/rules/__fixtures__/election";
import { TargetPanel } from "./TargetPanel";

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatAmount: (n: number) => `$${Math.round(n).toLocaleString("en-US")}` }),
}));

const race = buildRaceIndex(
  [
    election({
      cands: [
        { id: "a", name: "Grant Pruitt", party: "2", share: 52 },
        { id: "b", name: "Marcus Hale", party: "1", share: 48, isYou: true },
        { id: "n", name: "Npp Person", party: "1", share: 0, isNPP: true },
      ],
    }),
  ],
  { currentTurn: 10, nationalChamberKeys: ["senate"] }
)[0];
const pruitt = race.candidates.find((c) => c.id === "a")!;
const me = race.candidates.find((c) => c.id === "b")!;
const npp = race.candidates.find((c) => c.id === "n")!;

const info = {
  canInfluence: true,
  myActions: 20,
  myFunds: 100_000,
  myHomeState: "OH",
  targetHomeState: "OH",
  multiplier: 1,
  targetInfluence: 30,
  targetFavorability: 55,
  attackFailureChance: 22,
  targetMediaSustainedAtCap: false,
  supportFundsCostAnchor: 12_000,
  supportActionCost: 2,
  attackFundsCostAnchor: 18_000,
  attackActionCost: 3,
  barnstormFundsCostAnchor: 25_000,
  barnstormActionCost: 4,
};

let getBody: Record<string, unknown> = info;
beforeEach(() => {
  getBody = info;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({
            success: true,
            message: "You supported Grant Pruitt's reputation (+1% favorability)",
          })
        );
      }
      if (url.includes("missing")) return new Response("{}", { status: 500 });
      return new Response(JSON.stringify(getBody));
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TargetPanel", () => {
  it("asks for a candidate when none is picked", () => {
    renderWithElectionsMessages(
      <TargetPanel race={race} candidate={null} onActed={() => {}} onShowMyMoves={() => {}} />
    );
    expect(screen.getByText(/Pick a candidate in the race/)).toBeTruthy();
  });

  it("prices each action from the influence route", async () => {
    renderWithElectionsMessages(
      <TargetPanel race={race} candidate={pruitt} onActed={() => {}} onShowMyMoves={() => {}} />
    );
    expect(await screen.findByText("2 AP · $12,000")).toBeTruthy();
    expect(screen.getByText("3 AP · $18,000")).toBeTruthy();
    expect(screen.getByText("4 AP · $25,000")).toBeTruthy();
    expect(screen.getByText("-1% favorability · 22% fail")).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/characters/db-ch-a/influence");
  });

  it("uses the NPP boost route for an NPP", async () => {
    renderWithElectionsMessages(
      <TargetPanel race={race} candidate={npp} onActed={() => {}} onShowMyMoves={() => {}} />
    );
    await screen.findByText("2 AP · $12,000");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/npps/db-n-n/boost");
  });

  it("disables Boost with the reason at 100% favorability", async () => {
    getBody = { ...info, targetFavorability: 100 };
    renderWithElectionsMessages(
      <TargetPanel race={race} candidate={pruitt} onActed={() => {}} onShowMyMoves={() => {}} />
    );
    const boost = await screen.findByRole("button", { name: /Boost/ });
    expect((boost as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Maxed (100%)")).toBeTruthy();
  });

  it("runs an action, reports the server's message and tells the page", async () => {
    const onActed = vi.fn();
    renderWithElectionsMessages(
      <TargetPanel race={race} candidate={pruitt} onActed={onActed} onShowMyMoves={() => {}} />
    );
    fireEvent.click(await screen.findByRole("button", { name: /Boost/ }));
    await waitFor(() => expect(onActed).toHaveBeenCalled());
    const post = vi.mocked(fetch).mock.calls.find(([, i]) => i?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ action: "raise" });
    expect(
      await screen.findByText("You supported Grant Pruitt's reputation (+1% favorability)")
    ).toBeTruthy();
  });

  it("offers no actions on the player's own row", () => {
    const onShowMyMoves = vi.fn();
    renderWithElectionsMessages(
      <TargetPanel race={race} candidate={me} onActed={() => {}} onShowMyMoves={onShowMyMoves} />
    );
    expect(screen.queryByRole("button", { name: /Boost/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open My moves" }));
    expect(onShowMyMoves).toHaveBeenCalled();
  });

  it("shows the error line when the influence read fails", async () => {
    const missing = { ...pruitt, characterDbId: "missing" };
    renderWithElectionsMessages(
      <TargetPanel race={race} candidate={missing} onActed={() => {}} onShowMyMoves={() => {}} />
    );
    expect(await screen.findByText("Could not load influence data.")).toBeTruthy();
  });
});

describe("TargetPanel on a finished race", () => {
  it("offers no actions on a finished race", () => {
    const done = buildRaceIndex(
      [
        election({
          status: "resolved",
          isEnded: true,
          inGeneral: false,
          cands: [{ id: "a", name: "Grant Pruitt", party: "2", share: 52 }],
        }),
      ],
      { currentTurn: 10, nationalChamberKeys: ["senate"], includeFinal: true }
    )[0];
    renderWithElectionsMessages(
      <TargetPanel
        race={done}
        candidate={done.candidates[0]}
        onActed={() => {}}
        onShowMyMoves={() => {}}
      />
    );
    expect(screen.getByText("This race is over.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Boost/ })).toBeNull();
  });
});

describe("TargetPanel endorsements", () => {
  it("links each endorser of the picked candidate", () => {
    const endorsed = {
      ...pruitt,
      endorsements: [{ type: "npp" as const, nppId: "7", nppName: "Sen. Roe" }],
    };
    renderWithElectionsMessages(
      <TargetPanel race={race} candidate={endorsed} onActed={() => {}} onShowMyMoves={() => {}} />
    );
    expect(screen.getByRole("link", { name: /Sen. Roe/ }).getAttribute("href")).toBe(
      "/politicians/npp/7"
    );
  });
});
