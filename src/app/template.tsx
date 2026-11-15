import { cookies, headers } from "next/headers";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import {
  nonShellClientMessages,
  pickClientNamespaces,
  signedOutTemplateNamespaces,
} from "@/i18n/clientCatalog";
import { AUTH_COOKIE_NAME } from "@/lib/authCookieName";
import { RouteIntlProvider } from "@/i18n/RouteIntlProvider";
import { ExperimentalPageReveal } from "@/components/ExperimentalPageReveal";
import { isExperimentalUiEnabled } from "@/lib/api/experimentalUi";

/**
 * Per-navigation message provider.
 *
 * The root layout does not re-render on navigation, so a template is
 * re-created each navigation to carry the rest of the catalog, merged onto the
 * shell by `RouteIntlProvider`. Signed-in players always get the full catalog:
 * trimmed catalogs omitted strings that dialogs and panels render, exposing raw
 * message keys. Only signed-out visitors on public pages are trimmed.
 */
export default async function RootTemplate({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const signedOut = !cookieStore.has(AUTH_COOKIE_NAME);
  const trimmed = signedOut
    ? signedOutTemplateNamespaces(requestHeaders.get("x-pathname") ?? "/")
    : null;
  const routeMessages = trimmed
    ? pickClientNamespaces(messages, trimmed)
    : nonShellClientMessages(messages);
  // The opt-in is resolved on the server for every navigation: the cookie
  // first, then the account record, so the page a player lands on after
  // signing in decodes without waiting for a second load.
  const experimentalUi = await isExperimentalUiEnabled();
  return (
    <RouteIntlProvider messages={routeMessages}>
      <ExperimentalPageReveal enabled={experimentalUi}>{children}</ExperimentalPageReveal>
    </RouteIntlProvider>
  );
}
