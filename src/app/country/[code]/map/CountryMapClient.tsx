"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { preload } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type CountryId } from "@/lib/constants/countriesCore";
import type { MapOverviewResponse } from "@/lib/map/overviewTypes";
import { regionUrl } from "@/lib/urls";
import { USA_GEO_URL } from "@/lib/maps/usaGeometry";
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
const loadUSMap = () =>
  import("./components/USMapWithModes").then((m) => ({ default: m.USMapWithModes }));
const loadUnifiedMap = () =>
  import("./components/UnifiedMapWithModes").then((m) => ({ default: m.UnifiedMapWithModes }));
const loadEconOnlyMap = () =>
  import("./components/EconOnlyMapPlaceholder").then((m) => ({
    default: m.EconOnlyMapPlaceholder,
  }));
const USMapWithModes = dynamic(loadUSMap, { ssr: false, loading: MapLoading });
const UnifiedMapWithModes = dynamic(loadUnifiedMap, { ssr: false, loading: MapLoading });
const EconOnlyMapPlaceholder = dynamic(loadEconOnlyMap, { ssr: false, loading: MapLoading });

/**
 * Starts the renderer chunk (and the US geometry) while the overview request is
 * still in flight, so the map does not wait for data and then for its own code.
 */
function warmMapRenderer(countryId: CountryId) {
  const variant = mapVariantFor(countryId);
  if (variant === "us") {
    void loadUSMap();
    preload(USA_GEO_URL, { as: "fetch", crossOrigin: "anonymous" });
  } else if (variant === "parliamentary") {
    void loadUnifiedMap();
  } else {
    void loadEconOnlyMap();
  }
}

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
    warmMapRenderer(countryId);
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
