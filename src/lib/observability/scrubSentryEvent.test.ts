import { expect, it } from "vitest";
import type * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./scrubSentryEvent";

it("removes account and request data while preserving the diagnostic stack", () => {
  const event = {
    user: { email: "person@example.com" },
    request: { url: "https://game.example/path?email=person@example.com", data: "secret" },
    exception: {
      values: [
        {
          value: "Failure for person@example.com",
          stacktrace: { frames: [{ filename: "app.ts" }] },
        },
      ],
    },
    breadcrumbs: [{ message: "person@example.com clicked", data: { input: "private" } }],
    extra: { player: "private" },
  };

  const result = scrubSentryEvent(event as unknown as Sentry.ErrorEvent);
  expect(result.user).toBeUndefined();
  expect(result.request).toEqual({ url: "https://game.example/path" });
  expect(result.exception?.values?.[0]?.value).toBe("Failure for [email]");
  expect(result.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe("app.ts");
  expect(result.breadcrumbs?.[0]).toEqual({ message: "[email] clicked" });
  expect(result.extra).toBeUndefined();
});

it("keeps only the opaque account id from the user", () => {
  const result = scrubSentryEvent({
    type: undefined,
    user: { id: "u123", email: "person@example.com", username: "name", ip_address: "1.2.3.4" },
  } as Sentry.ErrorEvent);
  expect(result.user).toEqual({ id: "u123" });
});

it("keeps request paths, methods, statuses and navigation in breadcrumbs, nothing else", () => {
  const result = scrubSentryEvent({
    type: undefined,
    breadcrumbs: [
      {
        category: "fetch",
        data: {
          method: "POST",
          url: "https://ahousedividedgame.com/api/actions/execute?token=secret#x",
          status_code: 409,
          request_body_size: 40,
        },
      },
      { category: "navigation", data: { from: "/country/CA?tab=1", to: "/actions?ref=mail" } },
      { category: "ui.click", message: "button.primary", data: { value: "typed text" } },
    ],
  } as Sentry.ErrorEvent);
  expect(result.breadcrumbs?.[0].data).toEqual({
    method: "POST",
    url: "/api/actions/execute",
    status_code: 409,
  });
  expect(result.breadcrumbs?.[1].data).toEqual({ from: "/country/CA", to: "/actions" });
  expect(result.breadcrumbs?.[2]).toEqual({ category: "ui.click", message: "button.primary" });
});
