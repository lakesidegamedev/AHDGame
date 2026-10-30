import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { nonShellClientMessages } from "@/i18n/clientCatalog";
import { RouteIntlProvider } from "@/i18n/RouteIntlProvider";
import { ExperimentalPageReveal } from "@/components/ExperimentalPageReveal";

/**
 * Per-navigation message provider.
 *
 * The root layout does not re-render when the player navigates, so anything it
 * passes to `NextIntlClientProvider` stays put for the whole session. A template
 * is re-created on navigation, so it carries the rest of the catalog.
 *
 * The root layout sends the shell namespaces (navbar, tutorial coach); this adds
 * every other namespace, merged onto the shell by `RouteIntlProvider`. Per-route
 * trimming (`templateNamespacesForPath`) is switched off: players on the web app
 * saw raw message keys such as `corporations.sectorInvestment.buildTotal` in the
 * build dialog, because the trimmed catalog for their request lacked strings the
 * page renders. Staff were never trimmed, so it did not show for them. Re-enable
 * only with a check that covers every client component a route can mount.
 */
export default async function RootTemplate({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <RouteIntlProvider messages={nonShellClientMessages(messages)}>
      {/* A template is re-created on every navigation, so the opt-in ASCII
          decode plays once per page rather than once per visit. */}
      <ExperimentalPageReveal>{children}</ExperimentalPageReveal>
    </RouteIntlProvider>
  );
}
