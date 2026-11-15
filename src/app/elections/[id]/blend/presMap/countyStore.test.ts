import { afterEach, expect, it, vi } from "vitest";
import { cachedCounties, countyKey, loadCounties } from "./countyStore";

afterEach(() => vi.unstubAllGlobals());

it("preserves an unsupported historical result and its reason even without geometry", async () => {
  const response = {
    viewBox: "0 0 1 1",
    resultStatus: "unsupported",
    geometryAvailable: false,
    notice: "No riding placement was recorded.",
    subdivisions: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(response)))
  );
  expect(await loadCounties("unsupported-receipt", "CA_ON", 1)).toEqual(response);
  expect(cachedCounties(countyKey("unsupported-receipt", "CA_ON", 1))).toEqual(response);
  await loadCounties("unsupported-receipt", "CA_ON", 1);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("still retries an ordinary empty or failed response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ subdivisions: [] })))
  );
  expect(await loadCounties("empty-receipt", "OH", 1)).toBeNull();
  expect(await loadCounties("empty-receipt", "OH", 1)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
});
