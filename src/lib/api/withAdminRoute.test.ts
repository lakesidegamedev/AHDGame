import { beforeEach, describe, expect, it, vi } from "vitest";
import { withAdminRoute } from "./withAdminAuth";
import { requireAdmin, type AdminAuthResult } from "./requireAdmin";
import { handleRouteError } from "./errors";

vi.mock("./requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("./errors", () => ({ handleRouteError: vi.fn() }));

const admin = { userId: "admin-id", isAdmin: true } as Extract<
  AdminAuthResult,
  { ok: true }
>["admin"];
beforeEach(() => vi.resetAllMocks());

describe("withAdminRoute", () => {
  it.each([401, 403])(
    "preserves a denied response (%s) without running the handler",
    async (status) => {
      const response = new Response("Denied", { status, headers: { "x-auth": "denied" } });
      vi.mocked(requireAdmin).mockResolvedValue({ ok: false, response: response as never });
      const inner = vi.fn();
      expect(await withAdminRoute(inner)()).toBe(response);
      expect(requireAdmin).toHaveBeenCalledOnce();
      expect(inner).not.toHaveBeenCalled();
      expect(handleRouteError).not.toHaveBeenCalled();
    }
  );

  it("forwards the narrowed auth, request, and promised route context unchanged", async () => {
    const auth = { ok: true as const, admin };
    vi.mocked(requireAdmin).mockResolvedValue(auth);
    const request = new Request("http://localhost/api/admin/example", {
      method: "POST",
      body: "body",
    });
    const context = { params: Promise.resolve({ id: "example" }) };
    const response = new Response("Created", { status: 201, headers: { "x-result": "unchanged" } });
    const inner = vi.fn(async (resolved: typeof auth, req: Request, ctx: typeof context) => {
      expect(resolved).toBe(auth);
      expect(req).toBe(request);
      expect(ctx).toBe(context);
      expect(await req.text()).toBe("body");
      expect(await ctx.params).toEqual({ id: "example" });
      return response;
    });
    expect(await withAdminRoute(inner)(request, context)).toBe(response);
    expect(response.bodyUsed).toBe(false);
    expect(response.headers.get("x-result")).toBe("unchanged");
    expect(handleRouteError).not.toHaveBeenCalled();
  });

  it("routes an authentication exception through the existing error handler", async () => {
    const error = new Error("Auth unavailable");
    const response = new Response("Auth failure", { status: 500 });
    vi.mocked(requireAdmin).mockRejectedValue(error);
    vi.mocked(handleRouteError).mockReturnValue(response as never);
    const inner = vi.fn();
    expect(await withAdminRoute(inner)()).toBe(response);
    expect(inner).not.toHaveBeenCalled();
    expect(handleRouteError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it.each(["throw", "reject"] as const)("handles a handler %s exactly once", async (mode) => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: true, admin });
    const error = new Error("Route failed");
    const response = new Response("Route failure", { status: 500 });
    vi.mocked(handleRouteError).mockReturnValue(response as never);
    const inner =
      mode === "throw"
        ? () => {
            throw error;
          }
        : () => Promise.reject(error);
    expect(await withAdminRoute(inner)()).toBe(response);
    expect(handleRouteError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("propagates an error-handler failure without handling it a second time", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: true, admin });
    const serializerError = new Error("Serializer failed");
    vi.mocked(handleRouteError).mockImplementation(() => {
      throw serializerError;
    });
    await expect(
      withAdminRoute(async () => {
        throw new Error("Route failed");
      })()
    ).rejects.toBe(serializerError);
    expect(handleRouteError).toHaveBeenCalledOnce();
  });

  it("authenticates every invocation instead of caching an earlier grant", async () => {
    const denied = new Response("Denied", { status: 403 });
    vi.mocked(requireAdmin)
      .mockResolvedValueOnce({ ok: true, admin })
      .mockResolvedValueOnce({ ok: false, response: denied as never });
    const success = new Response("OK");
    const inner = vi.fn(async () => success);
    const route = withAdminRoute(inner);
    expect(await route()).toBe(success);
    expect(await route()).toBe(denied);
    expect(requireAdmin).toHaveBeenCalledTimes(2);
    expect(inner).toHaveBeenCalledOnce();
  });

  it("waits for authentication before entering the handler", async () => {
    let allow!: (value: { ok: true; admin: typeof admin }) => void;
    vi.mocked(requireAdmin).mockReturnValue(
      new Promise((resolve) => {
        allow = resolve;
      })
    );
    const inner = vi.fn(async () => new Response("OK"));
    const result = withAdminRoute(inner)();
    expect(inner).not.toHaveBeenCalled();
    allow({ ok: true, admin });
    await result;
    expect(inner).toHaveBeenCalledOnce();
  });
});
