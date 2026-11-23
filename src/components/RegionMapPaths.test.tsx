/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/observability/fetchJson", () => ({
  fetchJson: vi.fn().mockRejectedValue(new Error("network")),
}));

import { RegionMapPaths } from "./RegionMapPaths";

afterEach(cleanup);

describe("RegionMapPaths", () => {
  it("says the map could not load instead of loading forever", async () => {
    render(<RegionMapPaths geoUrl="/x.json" width={100} height={100} regionData={{}} />);
    expect(screen.getByText("Loading map…")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("The map could not be loaded.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
