/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NextIntlClientProvider, useLocale, useTranslations } from "next-intl";
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

// The template used to read the locale from the request; it now inherits the
// root provider's, so a German viewer must stay German inside the page.
it("inherits the root provider's locale and lets the route catalog win a clash", () => {
  function Probe() {
    const t = useTranslations("profile");
    return (
      <p>
        {useLocale()} / {t("title")}
      </p>
    );
  }
  render(
    <NextIntlClientProvider locale="de" messages={{ profile: { title: "Shell" } }}>
      <RouteIntlProvider messages={{ profile: { title: "Profil" } }}>
        <Probe />
      </RouteIntlProvider>
    </NextIntlClientProvider>
  );
  expect(screen.getByText("de / Profil")).toBeTruthy();
});
