"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type CountryId } from "@/lib/constants/countriesCore";
import type { MapOverviewResponse } from "@/lib/map/overviewTypes";
import { regionUrl } from "@/lib/urls";
import { mapVariantFor } from "./mapVariant";
import type { CountryMapViewConfig } from "./mapViewConfig";

interface CountryMapClientProps {
  countryId: CountryId;
  /** Server-resolved display fields, so the client does not ship the registry. */
  config: CountryMapViewConfig;
}

// A country uses exactly one renderer; load the chosen one instead of shipping
// the US electoral map, the parliamentary map and the economy placeholder (and
// their region configs) on every country map view.
const MapLoading = () => <div className="h-[420px] w-full animate-pulse rounded-xl bg-card" />;
const USMapWithModes = dynamic(
  () => import("./components/USMapWithModes").then((m) => ({ default: m.USMapWithModes })),
  { ssr: false, loading: MapLoading }
);
const UnifiedMapWithModes = dynamic(
  () =>
    import("./components/UnifiedMapWithModes").then((m) => ({ default: m.UnifiedMapWithModes })),
  { ssr: false, loading: MapLoading }
);
const EconOnlyMapPlaceholder = dynamic(
  () =>
    import("./components/EconOnlyMapPlaceholder").then((m) => ({
      default: m.EconOnlyMapPlaceholder,
    })),
  { ssr: false, loading: MapLoading }
);

export default function CountryMapClient({ countryId, config }: CountryMapClientProps) {
  return <CountryMapContent key={countryId} countryId={countryId} config={config} />;
}

function CountryMapContent({ countryId, config }: CountryMapClientProps) {
  const router = useRouter();
  const t = useTranslations("elections.atlas");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [mapData, setMapData] = useState<MapOverviewResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/map/overview?countryId=${countryId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Map unavailable");
        return res.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setMapData(data);
          setLoadState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState("error");
      });
    return () => controller.abort();
  }, [countryId, attempt]);

  const onRegionClick = (id: string) => router.push(regionUrl(countryId, id));

  if (loadState !== "ready") {
    return (
      <main className="mx-auto max-w-7xl p-8" aria-busy={loadState === "loading"}>
        <p role={loadState === "error" ? "alert" : "status"} className="text-muted">
          {t(loadState === "loading" ? "loading" : "loadError")}
        </p>
        {loadState === "error" && (
          <button
            className="mt-4 rounded-lg border border-card-border px-4 py-2"
            onClick={() => {
              setLoadState("loading");
              setAttempt((n) => n + 1);
            }}
          >
            {t("retry")}
          </button>
        )}
      </main>
    );
  }

  const variant = mapVariantFor(countryId);
  if (variant === "us") {
    return <USMapWithModes mapData={mapData} config={config} onRegionClick={onRegionClick} />;
  }
  if (variant === "parliamentary") {
    return <UnifiedMapWithModes mapData={mapData} config={config} onRegionClick={onRegionClick} />;
  }
  return (
    <EconOnlyMapPlaceholder
      countryId={countryId}
      config={config}
      mapData={mapData}
      onRegionClick={onRegionClick}
    />
  );
}
