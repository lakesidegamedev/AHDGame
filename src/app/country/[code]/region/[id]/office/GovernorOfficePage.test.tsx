/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { ObjectId, type Db } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthUserWithCharacter, type AuthUserWithCharacter } from "@/lib/auth";
import type { CountryId } from "@/lib/constants/countries";
import { loadIndependenceDesireSnapshots } from "@/lib/governorOffice/devolution/queries";
import { getDb } from "@/lib/mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import GovernorOfficePage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("@/lib/auth", () => ({ getAuthUserWithCharacter: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/time/gameTime", () => ({ getGameTime: vi.fn() }));
vi.mock("@/lib/governorOffice/devolution/queries", () => ({
  loadIndependenceDesireSnapshots: vi.fn(),
}));
vi.mock("@/app/whitehouse/ImpeachmentPanel", () => ({ default: () => null }));
vi.mock("@/components/HeroImage", () => ({ HeroImage: () => null }));
vi.mock("@/components/officials/OfficePoolTopUpButton", () => ({
  OfficePoolTopUpButton: () => null,
}));
vi.mock("./tabs/OverviewTab", () => ({ OverviewTab: () => <p>Office overview</p> }));

async function renderOffice(countryId: CountryId, stateId: string, viewerCountryId: CountryId) {
  const db = createMockDb();
  const viewerIsHolder = viewerCountryId === countryId;
  const viewerId = new ObjectId();
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  vi.mocked(getAuthUserWithCharacter).mockResolvedValue({
    isAdmin: !viewerIsHolder,
    character: { _id: viewerId, countryId: viewerCountryId },
  } as AuthUserWithCharacter);
  db.collection("states").findOne.mockResolvedValue({ _id: stateId, name: stateId });
  db.collection("electedOfficials").findOne.mockResolvedValue({
    characterId: viewerIsHolder ? viewerId : new ObjectId(),
    characterName: "Office holder",
  });
  render(await GovernorOfficePage({ params: Promise.resolve({ code: countryId, id: stateId }) }));
}

beforeEach(() => {
  vi.mocked(loadIndependenceDesireSnapshots)
    .mockReset()
    .mockResolvedValue([
      {
        stateId: "CA_QC",
        previous: 30,
        trend: 0,
        policy: "pro",
        westminsterPolicy: "anti",
        drivers: {
          policy: 0,
          westminsterPolicy: 0,
          regionalApproval: 0,
          nationalApproval: 0,
          inflation: 0,
          meanReversion: 0,
        },
        delta: 0,
        next: 30,
        inputs: { regionalApproval: 50, nationalApproval: 50, inflationPercent: 2 },
      },
    ]);
});

afterEach(cleanup);

describe("regional government sovereignty readout", () => {
  it("shows Sovereignty for the Quebec Premier", async () => {
    await renderOffice("CA", "CA_QC", "CA");

    expect(screen.getByRole("button", { name: "Sovereignty" })).toBeTruthy();
  });

  it("keeps the office overview for a foreign admin and skips the sovereignty readout", async () => {
    await renderOffice("CA", "CA_QC", "US");

    expect(screen.getByText("Office overview")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sovereignty" })).toBeNull();
    expect(loadIndependenceDesireSnapshots).not.toHaveBeenCalled();
  });
});
