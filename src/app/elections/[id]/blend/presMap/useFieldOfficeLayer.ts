"use client";

import { useCallback, useEffect, useState } from "react";
import { apiErrorText } from "@/lib/errors/catalog";
import { trackAction } from "@/lib/observability/actionBreadcrumb";
import type { FieldOfficeView } from "@/lib/campaigns/fieldOffices/queries";

/** The campaign whose field offices the map shows, handed in by the race page. */
export interface FieldOfficeLayerConfig {
  campaignId: string;
  /** Called after an office opens or closes so the war chest and actions refresh. */
  onChanged: () => void;
  /**
   * Changes whenever the campaign's offices do (its office count), so a change
   * made elsewhere on the page (the field tab's list) reloads the map's views.
   */
  version?: number;
  /** A `?tab=field&region=XX` link: the map opens in a field-office view. */
  startInFieldView?: boolean;
}

export interface FieldOfficeLayer {
  campaignId: string;
  /** The latest server view; carries enabled, canManage, costs, regions and offices. */
  meta: FieldOfficeView | null;
  /** The view that holds the county map of the state asked for, once loaded. */
  regionView: FieldOfficeView | null;
  loadError: string | null;
  /** The county picked on the map, within the state asked for. */
  selectedCounty: string | null;
  selectCounty: (id: string | null) => void;
  busy: string | null;
  message: { ok: boolean; text: string } | null;
  openOffice: (regionId: string, subdivisionId: string, label: string) => Promise<void>;
  closeOffice: (officeId: string, label: string) => Promise<void>;
}

/**
 * Field offices for the map: the same route and views the field tab uses
 * (`/api/campaigns/[id]/field-offices`), so the map never quotes a price or an
 * effect the engine does not. The route serves everyone; managers also get
 * costs and the value of a new office. `region` null loads only the summary.
 */
export function useFieldOfficeLayer(
  config: FieldOfficeLayerConfig | null,
  region: string | null
): FieldOfficeLayer | null {
  const campaignId = config?.campaignId ?? null;
  const version = config?.version ?? 0;
  const onChanged = config?.onChanged;
  const key = region ?? "";
  const [views, setViews] = useState<Record<string, FieldOfficeView>>({});
  const [meta, setMeta] = useState<FieldOfficeView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ region: string; id: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const have = key in views;

  // A different campaign starts from nothing; new offices drop what was loaded.
  const [seen, setSeen] = useState({ campaignId, version });
  if (seen.campaignId !== campaignId || seen.version !== version) {
    if (seen.campaignId !== campaignId) {
      setMeta(null);
      setPicked(null);
    }
    setSeen({ campaignId, version });
    setViews({});
  }

  useEffect(() => {
    if (!campaignId || have) return;
    let live = true;
    const qs = region ? `?region=${encodeURIComponent(region)}` : "";
    fetch(`/api/campaigns/${campaignId}/field-offices${qs}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) {
          setLoadError(apiErrorText(data, "Could not load field offices."));
          // Remember the miss so a failed region is not asked for in a loop.
          setViews((cur) => ({
            ...cur,
            [key]: cur[key] ?? ({ enabled: false } as FieldOfficeView),
          }));
          return;
        }
        const view = data.fieldOffices as FieldOfficeView;
        setLoadError(null);
        setMeta(view);
        setViews((cur) => ({ ...cur, [key]: view }));
      })
      .catch(() => {
        if (live) setLoadError("Network error");
      });
    return () => {
      live = false;
    };
  }, [campaignId, region, key, have]);

  const act = useCallback(
    async (busyKey: string, run: () => Promise<Response>, success: string) => {
      setBusy(busyKey);
      setMessage(null);
      try {
        const res = await run();
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setMessage({ ok: true, text: success });
          // Offices, costs and every county's marginal value just changed.
          setViews({});
          onChanged?.();
        } else {
          setMessage({ ok: false, text: apiErrorText(data, "That did not work.") });
        }
      } catch {
        setMessage({ ok: false, text: "Network error" });
      } finally {
        setBusy(null);
      }
    },
    [onChanged]
  );

  const openOffice = useCallback(
    (regionId: string, subdivisionId: string, label: string) => {
      trackAction("campaign.field-office.open", { regionId, subdivisionId });
      return act(
        `open:${regionId}:${subdivisionId}`,
        () =>
          fetch(`/api/campaigns/${campaignId}/field-offices`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ regionId, subdivisionId }),
          }),
        `Office opened in ${label}. It reaches full strength in ${meta?.rampTurns ?? "a few"} turns.`
      );
    },
    [act, campaignId, meta?.rampTurns]
  );
  const closeOffice = useCallback(
    (officeId: string, label: string) => {
      trackAction("campaign.field-office.close", { officeId });
      return act(
        `close:${officeId}`,
        () => fetch(`/api/campaigns/${campaignId}/field-offices/${officeId}`, { method: "DELETE" }),
        `Closed the ${label} office.`
      );
    },
    [act, campaignId]
  );

  const selectCounty = useCallback(
    (id: string | null) => setPicked(id && region ? { region, id } : null),
    [region]
  );

  if (!campaignId) return null;
  const loaded = region ? views[key] : undefined;
  return {
    campaignId,
    meta,
    regionView: loaded?.map ? loaded : null,
    loadError,
    selectedCounty: picked && picked.region === region ? picked.id : null,
    selectCounty,
    busy,
    message,
    openOffice,
    closeOffice,
  };
}
