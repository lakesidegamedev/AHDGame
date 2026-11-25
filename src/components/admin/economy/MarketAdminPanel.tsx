"use client";

import { useState, useEffect, useCallback } from "react";
interface MarketFlags {
  scarcityDriftEnabled: boolean;
  stockCoverCapEnabled: boolean;
  brandLoyaltyEnabled: boolean;
  brandLoyaltySliceEnabled: boolean;
  sectorQualityEnabled: boolean;
  qualityPremiumPricingEnabled: boolean;
  productLinesV2Enabled: boolean;
  mediaOperatingModelsEnabled: boolean;
  mediaProductSlatesEnabled: boolean;
  supplyAgreementsEnabled: boolean;
  shortageResponsiveSourcingEnabled: boolean;
  extractionOutputScaleEnabled: boolean;
}

const FEATURE_TOGGLES: Array<{
  key: keyof MarketFlags;
  label: string;
  description: string;
  requires?: Array<keyof MarketFlags>;
}> = [
  {
    key: "brandLoyaltyEnabled",
    label: "Brand loyalty",
    description:
      "Per-turn loyalty accrual from pricing consistency and delivery. Safe to enable alone (shadow accrual).",
  },
  {
    key: "brandLoyaltySliceEnabled",
    label: "Loyalty slice in clearing",
    description:
      "Second-stage gate: loyal customers reserve demand before cheapest-first clearing. Requires brand loyalty on.",
    requires: ["brandLoyaltyEnabled"],
  },
  {
    key: "sectorQualityEnabled",
    label: "Output quality",
    description:
      "Four-pillar quality per sector, rolled up to corp average and commodity propagation.",
  },
  {
    key: "qualityPremiumPricingEnabled",
    label: "Quality premium pricing",
    description: "Pass four-pillar product quality into clearing prices.",
  },
  {
    key: "productLinesV2Enabled",
    label: "Manufacturing product lines v2",
    description:
      "One active product project per corporation, allocated across owned plants. During development, paid R&D funds the project until its cost is met.",
  },
  {
    key: "mediaOperatingModelsEnabled",
    label: "Media operating models",
    description:
      "Named newspaper, radio, television, publishing, studio, music, cable, and streaming production recipes. Flag defaults off.",
  },
  {
    key: "mediaProductSlatesEnabled",
    label: "Media product slates",
    description:
      "Paid title development, model-specific coverage and cadence, and bounded quality and brand effects.",
    requires: [
      "mediaOperatingModelsEnabled",
      "brandLoyaltyEnabled",
      "brandLoyaltySliceEnabled",
      "qualityPremiumPricingEnabled",
    ],
  },
  {
    key: "supplyAgreementsEnabled",
    label: "Supply agreements",
    description: "CEO bilateral off-market commodity contracts (requires clearing for fills).",
  },
  {
    key: "scarcityDriftEnabled",
    label: "Scarcity price drift",
    description: "Persistent supply/demand imbalance ratchets commodity prices over time.",
  },
  {
    key: "shortageResponsiveSourcingEnabled",
    label: "Shortage-responsive sourcing",
    description:
      "Dark rollout: severely short states accept higher landed prices. Enable only after a controlled simulation report.",
  },
  {
    key: "stockCoverCapEnabled",
    label: "Stock cover cap",
    description: "Accelerated spoilage on shadow stock above cover cap (legacy overhang defusal).",
  },
  {
    key: "extractionOutputScaleEnabled",
    label: "Extraction output scale",
    description:
      "Structural extraction-shortage stabilizer (audit t873): lifts per-resource extraction supply (copper/rare earth 2.5×, gas 2×, iron 1.8×, timber 1.6×, oil 1.4×) to neutralize the chronic extractable shortage. Calibration stabilizer, not the durable fix. Copper's 2.5× predates the manual copper-titan boost — re-check EXTRACTION_OUTPUT_SCALE before enabling.",
  },
];

export function MarketAdminPanel() {
  const [flags, setFlags] = useState<MarketFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/config/market");
      if (res.ok) {
        const data = (await res.json()) as MarketFlags;
        setFlags({
          scarcityDriftEnabled: data.scarcityDriftEnabled === true,
          stockCoverCapEnabled: data.stockCoverCapEnabled === true,
          brandLoyaltyEnabled: data.brandLoyaltyEnabled === true,
          brandLoyaltySliceEnabled: data.brandLoyaltySliceEnabled === true,
          sectorQualityEnabled: data.sectorQualityEnabled === true,
          qualityPremiumPricingEnabled: data.qualityPremiumPricingEnabled === true,
          productLinesV2Enabled: data.productLinesV2Enabled === true,
          mediaOperatingModelsEnabled: data.mediaOperatingModelsEnabled === true,
          mediaProductSlatesEnabled: data.mediaProductSlatesEnabled === true,
          supplyAgreementsEnabled: data.supplyAgreementsEnabled === true,
          shortageResponsiveSourcingEnabled: data.shortageResponsiveSourcingEnabled === true,
          extractionOutputScaleEnabled: data.extractionOutputScaleEnabled === true,
        });
        setError("");
      } else {
        setError(`Couldn't load the market settings (HTTP ${res.status}).`);
      }
    } catch {
      setError("Couldn't load the market settings (network error).");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const patchConfig = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/config/market", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error || "Failed to update settings");
        return;
      }
      await fetchStatus();
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFlag = async (key: keyof MarketFlags) => {
    if (!flags) return;
    const next = !flags[key];
    const body: Record<string, unknown> = { [key]: next };
    if (key === "brandLoyaltyEnabled" && !next) {
      body.brandLoyaltySliceEnabled = false;
    }
    const ok = await patchConfig(body);
    if (ok) {
      const toggle = FEATURE_TOGGLES.find((f) => f.key === key);
      setMessage(`${toggle?.label ?? key} ${next ? "enabled" : "disabled"}.`);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-card-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-body text-muted">Loading market settings…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-body-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-body-sm text-success" role="status">
          {message}
        </p>
      ) : null}

      <div className="rounded-xl border border-card-border bg-card p-6 shadow-card">
        <h3 className="text-body-lg font-semibold">Premium & loyalty features</h3>
        <p className="mt-1 mb-4 text-body-sm text-muted">
          Package A/B market mechanics — toggled independently. Supply agreements fill before
          open-market clearing when enabled.
        </p>

        <div className="space-y-3">
          {FEATURE_TOGGLES.map((toggle) => {
            const enabled = flags?.[toggle.key] === true;
            const missingRequirements =
              toggle.requires?.filter((requirement) => flags?.[requirement] !== true) ?? [];
            const blocked = missingRequirements.length > 0;
            return (
              <div
                key={toggle.key}
                className="flex items-start justify-between gap-4 rounded-lg border border-card-border bg-background p-3"
              >
                <div className="min-w-0">
                  <div className="text-body font-medium text-foreground">{toggle.label}</div>
                  <p className="mt-0.5 text-body-sm text-muted">{toggle.description}</p>
                  {blocked && (
                    <p className="mt-1 text-body-sm text-warning">
                      Enable{" "}
                      {[
                        ...missingRequirements.map(
                          (requirement) =>
                            FEATURE_TOGGLES.find((feature) => feature.key === requirement)?.label
                        ),
                      ].join(", ")}{" "}
                      first.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={saving || !!blocked}
                  onClick={() => void handleToggleFlag(toggle.key)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                    enabled ? "bg-primary" : "bg-card-border"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      enabled ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
