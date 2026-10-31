"use client";
import type { AbstractIntlMessages } from "next-intl";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import { useMemo, type ReactNode } from "react";

/**
 * The per-route half of the client catalog, layered on the root layout's shell.
 *
 * A nested `NextIntlClientProvider` replaces its parent's messages rather than
 * merging them, so handing the route namespaces straight to one dropped `nav`
 * and `tutorial` for every page under `app/template.tsx` (the devolution tab
 * showed raw `nav.devolution.*` keys). Merging here keeps the shell namespaces
 * out of the template payload while still resolving them inside the page.
 */
export function RouteIntlProvider({
  messages,
  children,
}: {
  messages: AbstractIntlMessages;
  children: ReactNode;
}) {
  const locale = useLocale();
  const shell = useMessages();
  const merged = useMemo(() => ({ ...shell, ...messages }), [shell, messages]);
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}
