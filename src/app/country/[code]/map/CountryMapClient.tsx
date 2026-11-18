"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type CountryId } from "@/lib/constants/countriesCore";
import type { MapOverviewResponse } from "@/lib/map/overviewTypes";
import { regionUrl } from "@/lib/urls";
import { mapVariantFor } from "@/lib/world/mapVariant";
import type { CountryMapViewConfig } from "./mapViewConfig";

interface CountryMapClientProps {
  countryId: CountryId;
  /** Server-resolved display fields, so the client does not ship the registry. */
  config: CountryMapViewConfig;
  overview: MapOverviewResponse | null;
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
 * Start the renderer even when the overview needs a browser retry.
 */
function warmMapRenderer(countryId: CountryId) {
  const variant = mapVariantFor(countryId);
  if (variant === "us") {
    void loadUSMap();
  } else if (variant === "parliamentary") {
    void loadUnifiedMap();
  } else {
    void loadEconOnlyMap();
  }
}

export default function CountryMapClient(props: CountryMapClientProps) {
  return <CountryMapContent key={props.countryId} {...props} />;
}

function CountryMapContent({ countryId, config, overview }: CountryMapClientProps) {
  const router = useRouter();
  const t = useTranslations("elections.atlas");
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retriedOverview, setRetriedOverview] = useState<MapOverviewResponse | null>(null);
  const mapData = overview ?? retriedOverview;

  useEffect(() => {
    if (overview) return;
    warmMapRenderer(countryId);
    const controller = new AbortController();
    fetch(`/api/map/overview?countryId=${countryId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Map unavailable");
        return res.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setRetriedOverview(data);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [countryId, attempt, overview]);

  const onRegionClick = (id: string) => router.push(regionUrl(countryId, id));

  if (mapData === null) {
    return (
      <main className="mx-auto max-w-7xl p-8" aria-busy={!loadFailed}>
        <p role={loadFailed ? "alert" : "status"} className="text-muted">
          {t(loadFailed ? "loadError" : "loading")}
        </p>
        {loadFailed && (
          <button
            className="mt-4 rounded-lg border border-card-border px-4 py-2"
            onClick={() => {
              setLoadFailed(false);
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
