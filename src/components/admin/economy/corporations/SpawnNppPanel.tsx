"use client";

import type { Dispatch } from "react";
import { OPERATING_SECTOR_TYPE_LABELS } from "@/lib/constants/corporationsClient";
import type { CorporationsAdminAction, CorporationsAdminState } from "../useCorporationsAdminState";
import { apiErrorText } from "@/lib/errors/catalog";

export function SpawnNppPanel({
  spawnNppForm,
  spawnNppResult,
  spawnNppLoading,
  dispatch,
  fetchData,
}: {
  spawnNppForm: CorporationsAdminState["spawnNppForm"];
  spawnNppResult: CorporationsAdminState["spawnNppResult"];
  spawnNppLoading: boolean;
  dispatch: Dispatch<CorporationsAdminAction>;
  fetchData: () => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4 space-y-4">
      <h3 className="text-body-lg font-semibold">Spawn NPP corporation</h3>
      <p className="text-body-sm text-muted">
        Create a non-player-purchasable corporation. It will have no CEO, no user owner, and will
        participate in turn processing. It opens at the standard size for its sector unless you set
        a starting revenue.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-body-sm text-muted">Name</label>
          <input
            type="text"
            value={spawnNppForm.name}
            onChange={(e) =>
              dispatch({ type: "SET_SPAWN_NPP_FORM", value: { name: e.target.value } })
            }
            placeholder="e.g. Acme Industries"
            className="w-full rounded border border-card-border bg-background px-2 py-1 text-body"
          />
        </div>
        <div className="space-y-1">
          <label className="text-body-sm text-muted">Type</label>
          <select
            value={spawnNppForm.type}
            onChange={(e) =>
              dispatch({ type: "SET_SPAWN_NPP_FORM", value: { type: e.target.value } })
            }
            className="w-full rounded border border-card-border bg-background px-2 py-1 text-body"
          >
            {Object.entries(OPERATING_SECTOR_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-body-sm text-muted">Country</label>
          <select
            value={spawnNppForm.countryId}
            onChange={(e) =>
              dispatch({ type: "SET_SPAWN_NPP_FORM", value: { countryId: e.target.value } })
            }
            className="w-full rounded border border-card-border bg-background px-2 py-1 text-body"
          >
            {["US", "UK", "DE", "JP", "IE", "BR", "CN", "NG"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-body-sm text-muted">HQ state ID</label>
          <input
            type="text"
            value={spawnNppForm.headquartersState}
            onChange={(e) =>
              dispatch({
                type: "SET_SPAWN_NPP_FORM",
                value: { headquartersState: e.target.value },
              })
            }
            placeholder="e.g. CA, england, JP-13"
            className="w-full rounded border border-card-border bg-background px-2 py-1 text-body"
          />
        </div>
        <div className="space-y-1">
          <label className="text-body-sm text-muted">Starting capital</label>
          <input
            type="number"
            value={spawnNppForm.startingCapital}
            onChange={(e) =>
              dispatch({
                type: "SET_SPAWN_NPP_FORM",
                value: { startingCapital: e.target.value },
              })
            }
            placeholder="1000000"
            className="w-full rounded border border-card-border bg-background px-2 py-1 text-body"
          />
        </div>
        <div className="space-y-1">
          <label className="text-body-sm text-muted">Starting Revenue (optional)</label>
          <input
            type="number"
            value={spawnNppForm.startingRevenue}
            onChange={(e) =>
              dispatch({
                type: "SET_SPAWN_NPP_FORM",
                value: { startingRevenue: e.target.value },
              })
            }
            placeholder="Leave empty for the standard opening size"
            className="w-full rounded border border-card-border bg-background px-2 py-1 text-body"
          />
        </div>
        <div className="space-y-1">
          <label className="text-body-sm text-muted">Profit margin %</label>
          <input
            type="number"
            value={spawnNppForm.profitMargin}
            onChange={(e) =>
              dispatch({ type: "SET_SPAWN_NPP_FORM", value: { profitMargin: e.target.value } })
            }
            placeholder="35"
            className="w-full rounded border border-card-border bg-background px-2 py-1 text-body"
          />
        </div>
        <div className="space-y-1">
          <label className="text-body-sm text-muted">Brand Color (optional)</label>
          <input
            type="text"
            value={spawnNppForm.brandColor}
            onChange={(e) =>
              dispatch({ type: "SET_SPAWN_NPP_FORM", value: { brandColor: e.target.value } })
            }
            placeholder="#3b82f6"
            className="w-full rounded border border-card-border bg-background px-2 py-1 text-body"
          />
        </div>
      </div>

      {spawnNppResult && (
        <div
          className={`rounded-lg px-4 py-3 text-body ${
            spawnNppResult.success
              ? "bg-success/10 border border-success/30"
              : "bg-error/10 border border-error/30"
          }`}
        >
          {spawnNppResult.success ? (
            <div className="space-y-1">
              <p className="text-success font-medium">
                Spawned #{spawnNppResult.sequentialId}: {spawnNppResult.name}
              </p>
              <p className="text-body-sm text-muted">Corp ID: {spawnNppResult.corporationId}</p>
            </div>
          ) : (
            <p className="text-error">{spawnNppResult.error}</p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={async () => {
            dispatch({ type: "SET_SPAWN_NPP_LOADING", value: true });
            dispatch({ type: "SET_SPAWN_NPP_RESULT", value: null });
            dispatch({ type: "SET_ACTION_ERROR", value: null });
            try {
              const body: Record<string, unknown> = {
                name: spawnNppForm.name,
                type: spawnNppForm.type,
                countryId: spawnNppForm.countryId,
                headquartersState: spawnNppForm.headquartersState,
              };
              const capital = parseInt(spawnNppForm.startingCapital, 10);
              if (!isNaN(capital)) body.startingCapital = capital;
              const revenue = parseInt(spawnNppForm.startingRevenue, 10);
              if (!isNaN(revenue)) body.startingRevenue = revenue;
              const margin = parseFloat(spawnNppForm.profitMargin);
              if (!isNaN(margin)) body.profitMargin = margin;
              if (spawnNppForm.brandColor) body.brandColor = spawnNppForm.brandColor;

              const res = await fetch("/api/admin/corporations/spawn-npp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              const json = (await res.json()) as {
                success?: boolean;
                corporationId?: string;
                sequentialId?: number;
                name?: string;
                error?: string;
              };
              if (!res.ok) {
                dispatch({
                  type: "SET_SPAWN_NPP_RESULT",
                  value: { success: false, error: apiErrorText(json, `HTTP ${res.status}`) },
                });
              } else {
                dispatch({
                  type: "SET_SPAWN_NPP_RESULT",
                  value: {
                    success: true,
                    corporationId: json.corporationId,
                    sequentialId: json.sequentialId,
                    name: json.name,
                  },
                });
                await fetchData();
              }
            } catch (e) {
              dispatch({
                type: "SET_SPAWN_NPP_RESULT",
                value: {
                  success: false,
                  error: e instanceof Error ? e.message : "Failed to spawn corporation",
                },
              });
            } finally {
              dispatch({ type: "SET_SPAWN_NPP_LOADING", value: false });
            }
          }}
          disabled={
            spawnNppLoading || !spawnNppForm.name.trim() || !spawnNppForm.headquartersState.trim()
          }
          className="text-body-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:bg-card-border disabled:text-muted"
        >
          {spawnNppLoading ? "Spawning…" : "Spawn corporation"}
        </button>
        <button
          onClick={async () => {
            dispatch({ type: "SET_SPAWN_NPP_LOADING", value: true });
            dispatch({ type: "SET_SPAWN_NPP_RESULT", value: null });
            dispatch({ type: "SET_ACTION_ERROR", value: null });
            try {
              const body: Record<string, unknown> = {
                countryId: spawnNppForm.countryId,
              };
              const capital = parseInt(spawnNppForm.startingCapital, 10);
              if (!isNaN(capital)) body.startingCapital = capital;
              if (spawnNppForm.headquartersState.trim()) {
                body.headquartersState = spawnNppForm.headquartersState.trim();
              }

              const res = await fetch("/api/admin/corporations/spawn-npp-batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              const json = (await res.json()) as {
                success?: boolean;
                spawned?: number;
                corporations?: Array<{ name: string; corporationId: string; type: string }>;
                error?: string;
              };
              if (!res.ok) {
                dispatch({
                  type: "SET_SPAWN_NPP_RESULT",
                  value: { success: false, error: apiErrorText(json, `HTTP ${res.status}`) },
                });
              } else {
                dispatch({
                  type: "SET_SPAWN_NPP_RESULT",
                  value: {
                    success: true,
                    corporationId: `${json.spawned ?? 0} corps`,
                    name: json.corporations?.map((c) => c.name).join(", ") ?? "",
                  },
                });
                await fetchData();
              }
            } catch (e) {
              dispatch({
                type: "SET_SPAWN_NPP_RESULT",
                value: {
                  success: false,
                  error: e instanceof Error ? e.message : "Failed to batch spawn",
                },
              });
            } finally {
              dispatch({ type: "SET_SPAWN_NPP_LOADING", value: false });
            }
          }}
          disabled={spawnNppLoading || !spawnNppForm.countryId}
          className="text-body-sm px-3 py-1.5 rounded bg-secondary text-secondary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {spawnNppLoading ? "Spawning…" : "Batch spawn all sectors"}
        </button>
        <button
          onClick={() => {
            dispatch({ type: "SET_INLINE", value: null });
            dispatch({ type: "SET_SPAWN_NPP_RESULT", value: null });
          }}
          className="text-body-sm text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
