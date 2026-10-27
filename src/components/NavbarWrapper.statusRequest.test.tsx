/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { AuthDataProvider } from "@/contexts/AuthDataContext";
import { CharacterStatsProvider } from "@/contexts/CharacterStatsContext";
import { NavbarWrapper } from "./NavbarWrapper";

vi.mock("next/navigation", () => ({
  usePathname: () => "/corporation/7",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/contexts/InterfaceContext", () => ({
  useInterface: () => ({ mode: "modern", setMode: vi.fn() }),
}));
vi.mock("@/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/analytics/posthogClient", () => ({ getPostHogClient: async () => null }));
vi.mock("./Wordmark", () => ({ Wordmark: () => null }));
vi.mock("./NavbarTopFlair", () => ({ NavbarTopFlair: () => null }));
vi.mock("./Navbar", () => ({ Navbar: () => null }));
vi.mock("./ExperimentalNavbar", () => ({ ExperimentalNavbar: () => null }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderShell() {
  return render(
    <AuthDataProvider hasSessionHint>
      <CharacterStatsProvider>
        <NavbarWrapper singleplayer={false} initialPageCountry={null} />
      </CharacterStatsProvider>
    </AuthDataProvider>
  );
}

/**
 * The status payload used to be requested only after `/api/client-nav` came
 * back, because that payload was the only place the bar layout (part of the
 * request URL) was known. Two sequential round trips for the bar on every page.
 * The server now says from the cookie whether a session is even possible, and
 * the device knows its own layout, so the request starts with the page.
 */
describe("navbar status request", () => {
  it("asks for the status payload without waiting for the auth bootstrap", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      // The bootstrap never resolves: the assertion below is about what was
      // asked for while it is still in flight.
      if (url === "/api/client-nav") return new Promise<Response>(() => {});
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderShell();

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(urls).toContain("/api/client-status?layout=standard");
    });
  });

  it("uses the device layout for the first request", async () => {
    localStorage.setItem("statusBarLayout", "corp");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/client-nav") return new Promise<Response>(() => {});
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderShell();

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(urls).toContain("/api/client-status?layout=corp");
    });
  });
});
