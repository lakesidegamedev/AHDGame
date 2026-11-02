import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import elections from "../../../messages/en/elections.json";
import profile from "../../../messages/en/profile.json";

/**
 * Render election and Campaign Manager screens with the app's English
 * `elections` and `profile` catalogs (the Campaign Manager route ships both).
 */
export function renderWithElectionsMessages(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={{ ...elections, ...profile }}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}
