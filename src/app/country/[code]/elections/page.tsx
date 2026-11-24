import { Suspense } from "react";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getAuthUser } from "@/lib/auth";
import { loadCountryElections } from "@/lib/elections/loadCountryElections";
import ElectionsClient from "./ElectionsClient";
import { ElectionsSkeleton } from "./components/ElectionsSkeleton";

// The list is loaded with a direct DB call and seeds the client, so it renders
// without a shell -> effect -> fetch loop. The viewer's character, chamber
// composition and game state stay client-side and hydrate after paint.
async function SeededElections({ code }: { code: string }) {
  const countryId = code.toUpperCase() as CountryId;
  if (!COUNTRY_CONFIGS[countryId]) {
    return <ElectionsClient code={code} />;
  }

  const user = await getAuthUser();
  const viewer = {
    userId: user?.userId ?? null,
    isAdmin: user?.isAdmin ?? false,
    activeCharacterId: user?.activeCharacterId ?? null,
  };

  // A DB hiccup must not blank the page: the client falls back to its own fetch.
  const elections = await loadCountryElections(countryId, viewer).catch(() => null);
  if (elections === null) return <ElectionsClient code={code} />;
  return <ElectionsClient code={code} initialElections={elections} />;
}

export default async function ElectionsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // The skeleton matches the client's own loading frame, so the page chrome
  // flushes before the election queries finish.
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background pb-16">
          <main className="mx-auto min-w-0 max-w-7xl space-y-8 overflow-x-hidden px-4 py-8 sm:px-6 sm:py-12">
            <ElectionsSkeleton />
          </main>
        </div>
      }
    >
      <SeededElections code={code} />
    </Suspense>
  );
}
