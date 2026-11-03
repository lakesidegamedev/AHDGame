/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import {
  withLegislativePriorities,
  getDefaultLegislativePriorities,
} from "@/lib/demographics/legislativePriorities/profile";
import {
  resolvePrioritySelection,
  type LegislativePrioritySelection,
  type PriorityLaw,
} from "@/lib/demographics/legislativePriorities/rules";
import { ElectorateDossier } from "./ElectorateDossier";

const laws: PriorityLaw[] = legislationTypes
  .filter((l) => l.countryScope === "us" && l.policyOptions?.length)
  .map((l) => ({ ...l, policyOptions: l.policyOptions! }));
const lawMap = new Map(laws.map((l) => [l._id, l]));
const profile = withLegislativePriorities(
  [
    {
      dim: "age",
      dimLabel: "Age",
      buckets: [
        {
          id: "age:young",
          label: "Under 30s",
          sharePct: 70,
          economicLean: -1,
          socialLean: -1,
          turnout: 45,
        },
        {
          id: "age:senior",
          label: "Over 65s",
          sharePct: 30,
          economicLean: 1,
          socialLean: 1,
          turnout: 75,
        },
      ],
    },
  ],
  "US",
  "CA"
)!;
const initial = getDefaultLegislativePriorities("US", "CA", "age:young")!;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function dossier(isAdmin = true) {
  return (
    <ElectorateDossier
      profile={profile}
      regionParties={[]}
      isAdmin={isAdmin}
      countryId="US"
      regionId="CA"
    />
  );
}

describe("admin electorate priority editing", () => {
  let saved: Map<string, LegislativePrioritySelection>;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    saved = new Map();
    fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (!init?.method) {
        const bucketId = new URL(input, "http://localhost").searchParams.get("bucketId")!;
        const defaults = getDefaultLegislativePriorities("US", "CA", bucketId)!;
        const selection = saved.get(bucketId);
        return json({
          priorities: selection ? resolvePrioritySelection("US", selection, lawMap) : defaults,
          defaults,
          laws,
          isOverride: Boolean(selection),
          invalidOverride: false,
        });
      }
      const body = JSON.parse(init.body as string);
      if (init.method === "DELETE") {
        saved.delete(body.bucketId);
        return json({
          priorities: getDefaultLegislativePriorities("US", "CA", body.bucketId),
          isOverride: false,
        });
      }
      saved.set(body.bucketId, body.priorities);
      return json({
        priorities: resolvePrioritySelection("US", body.priorities, lawMap),
        isOverride: true,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function openEditor() {
    fireEvent.click(screen.getByRole("button", { name: "admin" }));
    await screen.findByRole("combobox", { name: "Primary law" });
  }

  it("hides Admin and never requests privileged options for ordinary viewers", () => {
    render(dossier(false));
    expect(screen.queryByRole("button", { name: "admin" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves exact levels, updates the player view and can restore authored defaults", async () => {
    render(dossier());
    expect(screen.getByRole("button", { name: "admin" }).className).toContain("text-red-400");
    await openEditor();
    expect(screen.getAllByRole("combobox")).toHaveLength(8);
    fireEvent.change(screen.getByRole("combobox", { name: "Primary law" }), {
      target: { value: "us_state_environment" },
    });
    expect(
      (screen.getByRole("button", { name: "Save priorities" }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Primary level" }), {
      target: { value: "state_environment_opt_1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save priorities" }));
    await screen.findByText("Legislative priorities saved.");
    const payload = JSON.parse(
      fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")![1].body
    );
    expect(payload).toMatchObject({
      countryId: "US",
      regionId: "CA",
      bucketId: "age:young",
      priorities: {
        primary: { lawTypeId: "us_state_environment", policyOptionId: "state_environment_opt_1" },
      },
    });
    expect(payload.priorities.secondary).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "simple" }));
    expect(screen.getByText("Desired level: State Clean Energy Leadership Act")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Over 65s/ }));
    expect(screen.getByText("Desired level: Benefit Protection Act")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Under 30s/ }));
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Restore defaults" }));
    await screen.findByText("Default priorities restored.");
    fireEvent.click(screen.getByRole("button", { name: "simple" }));
    expect(screen.getByText(`Desired level: ${initial.primary.policyOptionName}`)).toBeTruthy();
    expect(screen.queryByText("Desired level: State Clean Energy Leadership Act")).toBeNull();
  });

  it("allows editing secondary laws and levels and blocks duplicate laws", async () => {
    render(dossier());
    await openEditor();
    fireEvent.change(screen.getByRole("combobox", { name: "Secondary 2 law" }), {
      target: { value: initial.primary.lawTypeId },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Secondary 2 level" }), {
      target: { value: initial.primary.policyOptionId },
    });
    expect(screen.getByText("Choose four different laws and a valid level for each.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save priorities" }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Secondary 2 law" }), {
      target: { value: "us_state_environment" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Secondary 2 level" }), {
      target: { value: "state_environment_opt_2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save priorities" }));
    await screen.findByText("Legislative priorities saved.");
    expect(saved.get("age:young")!.secondary[1]).toEqual({
      lawTypeId: "us_state_environment",
      policyOptionId: "state_environment_opt_2",
    });
  });

  it("shows loading failures and can retry without hiding them", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "Forbidden" }, 403));
    render(dossier());
    fireEvent.click(screen.getByRole("button", { name: "admin" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save priorities" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("combobox", { name: "Primary law" });
  });

  it("keeps the current display unchanged if a save fails", async () => {
    render(dossier());
    await openEditor();
    fireEvent.change(screen.getByRole("combobox", { name: "Primary level" }), {
      target: { value: "state_housing_opt_2" },
    });
    fetchMock.mockResolvedValueOnce(json({ error: "Forbidden" }, 403));
    fireEvent.click(screen.getByRole("button", { name: "Save priorities" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Legislative priorities saved.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "simple" }));
    expect(screen.getByText(`Desired level: ${initial.primary.policyOptionName}`)).toBeTruthy();
  });

  it("does not put a slow previous group's data into the newly selected group", async () => {
    let finishOld!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishOld = resolve;
        })
    );
    render(dossier());
    fireEvent.click(screen.getByRole("button", { name: "admin" }));
    fireEvent.click(screen.getByRole("button", { name: /Over 65s/ }));
    const select = (await screen.findByRole("combobox", {
      name: "Primary law",
    })) as HTMLSelectElement;
    const expected = getDefaultLegislativePriorities("US", "CA", "age:senior")!;
    expect(select.value).toBe(expected.primary.lawTypeId);
    await act(async () => {
      finishOld(json({ priorities: initial, laws, isOverride: false }));
    });
    await waitFor(() => expect(select.value).toBe(expected.primary.lawTypeId));
    fireEvent.click(screen.getByRole("button", { name: "Save priorities" }));
    await screen.findByText("Legislative priorities saved.");
    expect(saved.has("age:senior")).toBe(true);
    expect(saved.has("age:young")).toBe(false);
  });

  it("removes admin controls if privileges are revoked", async () => {
    const { rerender } = render(dossier());
    await openEditor();
    rerender(dossier(false));
    expect(screen.queryByRole("button", { name: "admin" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Edit legislative priorities" })).toBeNull();
    expect(screen.getByRole("region", { name: "Legislative priorities" })).toBeTruthy();
  });

  it("accepts fresh server priorities after an optimistic save", async () => {
    const { rerender } = render(dossier());
    await openEditor();
    fireEvent.change(screen.getByRole("combobox", { name: "Primary level" }), {
      target: { value: "state_housing_opt_2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save priorities" }));
    await screen.findByText("Legislative priorities saved.");
    fireEvent.click(screen.getByRole("button", { name: "simple" }));
    expect(screen.getByText("Desired level: State Housing Investment Act")).toBeTruthy();
    const fresh = structuredClone(profile);
    const young = fresh[0].buckets.find((b) => b.id === "age:young")!;
    young.legislativePriorities!.primary.policyOptionId = "state_housing_opt_0";
    young.legislativePriorities!.primary.policyOptionName = "State Housing Guarantee Act";
    rerender(
      <ElectorateDossier profile={fresh} regionParties={[]} isAdmin countryId="US" regionId="CA" />
    );
    expect(screen.getByText("Desired level: State Housing Guarantee Act")).toBeTruthy();
    expect(screen.queryByText("Desired level: State Housing Investment Act")).toBeNull();
  });
});
