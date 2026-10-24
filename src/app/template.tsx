import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { verifyAuth } from "@/lib/auth";
import {
  nonShellClientMessages,
  pickClientNamespaces,
  templateNamespacesForPath,
} from "@/i18n/clientCatalog";

/**
 * Per-navigation message provider.
 *
 * The root layout does not re-render when the player navigates, so anything it
 * passes to `NextIntlClientProvider` stays put for the whole session. A template
 * is re-created on navigation, which makes it the right place for a message
 * catalog that depends on the current route: the player moving from /actions to
 * /profile gets the profile copy, and the server dictionary is never stale.
 *
 * The root layout sends the shell namespaces (navbar, tutorial coach); this adds
 * the rest of what the route can translate. Unlisted routes get everything that
 * is not shell, which is the pre-1.19 behaviour.
 */
export default async function RootTemplate({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pathname") ?? "/";
  const messages = await getMessages();

  let viewer: Awaited<ReturnType<typeof verifyAuth>> = null;
  try {
    viewer = await verifyAuth();
  } catch {
    // Fail safe: an unreadable session gets the full catalog, not a thinner one.
    viewer = null;
  }

  const namespaces = templateNamespacesForPath(pathname, viewer);
  const clientMessages = namespaces
    ? pickClientNamespaces(messages, namespaces)
    : nonShellClientMessages(messages);

  return <NextIntlClientProvider messages={clientMessages}>{children}</NextIntlClientProvider>;
}
