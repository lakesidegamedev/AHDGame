import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { nonShellClientMessages } from "@/i18n/clientCatalog";
import { RouteIntlProvider } from "@/i18n/RouteIntlProvider";
import { ExperimentalPageReveal } from "@/components/ExperimentalPageReveal";
import { isExperimentalUiEnabled } from "@/lib/api/experimentalUi";

/**
 * Per-navigation message provider.
 *
 * The root layout does not re-render on navigation, so a template is
 * re-created each navigation to carry the rest of the catalog, merged onto the
 * shell by `RouteIntlProvider`. Per-route trimming (`templateNamespacesForPath`)
 * is disabled: trimmed catalogs omitted strings pages render, exposing raw
 * message keys to players. Re-enable only with a check covering every client
 * component a route can mount.
 */
export default async function RootTemplate({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  // The opt-in is resolved on the server for every navigation: the cookie
  // first, then the account record, so the page a player lands on after
  // signing in decodes without waiting for a second load.
  const experimentalUi = await isExperimentalUiEnabled();
  return (
    <RouteIntlProvider messages={nonShellClientMessages(messages)}>
      <ExperimentalPageReveal enabled={experimentalUi}>{children}</ExperimentalPageReveal>
    </RouteIntlProvider>
  );
}
