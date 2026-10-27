// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import BulkBuildCapacityDialog, {
  type BulkBuildRequestFn,
  type BulkBuildRow,
} from "./BulkBuildCapacityDialog";

afterEach(cleanup);

const sectors = [
  { _id: "s1", stateId: "US-AL", stateName: "Alabama", countryId: "US", sectorType: "energy" },
  { _id: "s2", stateId: "US-CA", stateName: "California", countryId: "US", sectorType: "retail" },
  { _id: "s3", stateId: "GB-ENG", stateName: "England", countryId: "GB", sectorType: "energy" },
];

function row(sectorId: string, stateId: string, status: BulkBuildRow["status"], cost: number) {
  return {
    sectorId,
    stateId,
    countryId: "US",
    sectorType: "energy",
    capacityUnits: 1000,
    units: 100,
    costLocal: cost,
    understaffed: false,
    status,
    reason: status === "over_budget" ? "Not enough cash left after the sectors above" : null,
  };
}

it("previews the filtered sectors, confirms the exact total, then shows the results", async () => {
  const onRequest = vi.fn<BulkBuildRequestFn>(async (body) =>
    body.mode === "preview"
      ? {
          ok: true,
          data: {
            mode: "preview",
            cashLocal: 500,
            readyCount: 1,
            readyCostLocal: 300,
            cashAfterLocal: 200,
            rows: [row("s1", "US-AL", "ready", 300)],
          },
        }
      : {
          ok: true,
          data: {
            mode: "apply",
            builtCount: 1,
            spentLocal: 300,
            cashAfterLocal: 200,
            rows: [row("s1", "US-AL", "built", 300)],
          },
        }
  );
  const onApplied = vi.fn();
  render(
    <BulkBuildCapacityDialog
      open
      onClose={() => {}}
      sectors={sectors}
      homeCountry="US"
      countryLabel={(c) => (c === "US" ? "United States" : "United Kingdom")}
      fmt={(n) => `$${n}`}
      cashLocal={500}
      onRequest={onRequest}
      onApplied={onApplied}
    />
  );

  // All three sectors match by default; narrowing to the US and energy leaves one.
  expect(screen.getByText("Preview 3 sectors")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Country"), { target: { value: "US" } });
  fireEvent.change(screen.getByLabelText("Sector type"), { target: { value: "energy" } });
  fireEvent.change(screen.getByLabelText("Facilities per sector"), { target: { value: "2" } });
  fireEvent.click(screen.getByText("Preview 1 sector"));

  await waitFor(() => expect(screen.getByText("Alabama")).toBeTruthy());
  expect(onRequest).toHaveBeenLastCalledWith({
    countryId: "US",
    sectorType: "energy",
    rule: { kind: "facilities", count: 2 },
    mode: "preview",
  });
  expect(screen.getByText("Will build")).toBeTruthy();
  expect(screen.getByText("1 of 1 sectors can be built")).toBeTruthy();

  fireEvent.click(screen.getByText("Build 1 sector"));
  expect(screen.getByText("Spend up to $300 building in 1 sector?")).toBeTruthy();
  fireEvent.click(screen.getByText("Confirm $300"));

  await waitFor(() => expect(screen.getByText("Built 1 of 1 sectors for $300.")).toBeTruthy());
  expect(onRequest).toHaveBeenLastCalledWith({
    countryId: "US",
    sectorType: "energy",
    rule: { kind: "facilities", count: 2 },
    mode: "apply",
    maxTotalLocal: 300,
  });
  expect(onApplied).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Built")).toBeTruthy();
});

it("drops a stale preview when the selection changes and shows server errors", async () => {
  const onRequest = vi.fn<BulkBuildRequestFn>(async () => ({
    ok: true,
    data: {
      mode: "preview",
      cashLocal: 100,
      readyCount: 0,
      readyCostLocal: 0,
      cashAfterLocal: 100,
      rows: [row("s1", "US-AL", "over_budget", 300)],
    },
  }));
  render(
    <BulkBuildCapacityDialog
      open
      onClose={() => {}}
      sectors={sectors}
      homeCountry="US"
      countryLabel={(c) => c}
      fmt={(n) => `$${n}`}
      cashLocal={100}
      onRequest={onRequest}
      onApplied={() => {}}
    />
  );
  fireEvent.click(screen.getByText("Preview 3 sectors"));
  await waitFor(() => expect(screen.getByText("Not enough cash")).toBeTruthy());
  expect(
    (screen.getByText("Build 0 sectors") as HTMLButtonElement).closest("button")!.disabled
  ).toBe(true);

  fireEvent.click(screen.getByLabelText("Percent of current capacity"));
  fireEvent.change(screen.getByLabelText("Percent of current capacity"), {
    target: { value: "25" },
  });
  expect(screen.queryByText("Not enough cash")).toBeNull();

  onRequest.mockResolvedValueOnce({ ok: false, error: "Corporation actions are paused" });
  fireEvent.click(screen.getByText("Preview 3 sectors"));
  await waitFor(() => expect(screen.getByText("Corporation actions are paused")).toBeTruthy());
  expect(onRequest).toHaveBeenLastCalledWith(
    expect.objectContaining({ rule: { kind: "percent", percent: 25 } })
  );
});
