/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { AuthDataProvider } from "@/contexts/AuthDataContext";
import { CharacterStatsProvider } from "@/contexts/CharacterStatsContext";
import { NavbarWrapper } from "./NavbarWrapper";

const variants = vi.hoisted(() => {
  const { promise, resolve } = Promise.withResolvers<void>();
  return {
    classic: vi.fn(),
    modern: vi.fn(),
    promise,
    resolve,
    translate: (key: string) => key,
    showToast: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/corporation/7",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => variants.translate }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/dynamic", async () => {
  const { lazy } = await import("react");
  return {
    default: (load: () => Promise<React.ComponentType>) =>
      lazy(async () => ({ default: await load() })),
  };
});
vi.mock("@/contexts/InterfaceContext", () => ({
  useInterface: () => ({ mode: "modern", setMode: vi.fn() }),
}));
vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: variants.showToast }),
}));
vi.mock("@/lib/analytics/posthogClient", () => ({ getPostHogClient: async () => null }));
vi.mock("./Wordmark", () => ({ Wordmark: () => null }));
vi.mock("./NavbarTopFlair", () => ({ NavbarTopFlair: () => null }));
vi.mock("./Navbar", () => {
  variants.classic();
  return { Navbar: () => null };
});
vi.mock("./ExperimentalNavbar", async () => {
  variants.modern();
  await variants.promise;
  return { ExperimentalNavbar: () => <nav aria-label="Modern navigation" /> };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderShell(hasSessionHint = true) {
  return render(
    <AuthDataProvider hasSessionHint={hasSessionHint}>
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
  it("loads the selected navbar and preserves its height during the download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ user: null }), { status: 200 }))
    );
    const { container, findByRole } = renderShell(false);
    await waitFor(() => expect(variants.modern).toHaveBeenCalledOnce());
    expect(container.querySelector("[data-site-navbar] > div")?.className).toContain(
      "h-14 lg:h-[60px]"
    );
    expect(variants.classic).not.toHaveBeenCalled();

    variants.resolve();
    await findByRole("navigation", { name: "Modern navigation" });
  });

  it("asks for the status payload without waiting for the auth bootstrap", async () => {
    const bootstrap = Promise.withResolvers<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/client-nav") return bootstrap.promise;
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderShell();

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(urls).toContain("/api/client-status?layout=standard");
    });
    await act(async () => bootstrap.resolve(Response.json({ user: null })));
  });

  it("uses the device layout for the first request", async () => {
    localStorage.setItem("statusBarLayout", "corp");
    const bootstrap = Promise.withResolvers<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/client-nav") return bootstrap.promise;
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderShell();

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(urls).toContain("/api/client-status?layout=corp");
    });
    await act(async () => bootstrap.resolve(Response.json({ user: null })));
  });
});
