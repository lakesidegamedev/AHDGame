/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { RouteIntlProvider } from "./RouteIntlProvider";

afterEach(cleanup);

function Labels() {
  const nav = useTranslations("nav.devolution");
  const profile = useTranslations("profile");
  return (
    <p>
      {nav("independenceDesire")} / {profile("title")}
    </p>
  );
}

// The root layout ships the shell namespaces and the per-route template adds the
// rest. A nested provider replaces its parent's messages, so the route provider
// has to merge or every page loses the shell copy (raw "nav.devolution.*" keys).
it("keeps the root layout's shell namespaces inside the route catalog", () => {
  render(
    <NextIntlClientProvider
      locale="en"
      messages={{ nav: { devolution: { independenceDesire: "Independence Desire" } } }}
    >
      <RouteIntlProvider messages={{ profile: { title: "Profile" } }}>
        <Labels />
      </RouteIntlProvider>
    </NextIntlClientProvider>
  );
  expect(screen.getByText("Independence Desire / Profile")).toBeTruthy();
});
