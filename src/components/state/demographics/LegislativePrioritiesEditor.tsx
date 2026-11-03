"use client";

import { useEffect, useState } from "react";
import { fetchJson, HttpError } from "@/lib/observability/fetchJson";
import type { PriorityReference } from "@/lib/demographics/legislativePriorities/catalog";
import type {
  LegislativePriorities,
  PriorityLaw,
} from "@/lib/demographics/legislativePriorities/rules";

interface EditorData {
  priorities: LegislativePriorities;
  laws: PriorityLaw[];
  isOverride: boolean;
  invalidOverride: boolean;
}

function references(priorities: LegislativePriorities): PriorityReference[] {
  return [priorities.primary, ...priorities.secondary].map(({ lawTypeId, policyOptionId }) => ({
    lawTypeId,
    policyOptionId,
  }));
}

export function LegislativePrioritiesEditor({
  countryId,
  regionId,
  bucketId,
  onSaved,
}: {
  countryId: string;
  regionId: string;
  bucketId: string;
  onSaved: (priorities: LegislativePriorities) => void;
}) {
  const [data, setData] = useState<EditorData | null>(null);
  const [draft, setDraft] = useState<PriorityReference[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const query = new URLSearchParams({ countryId, regionId, bucketId }).toString();

  useEffect(() => {
    const controller = new AbortController();
    void fetchJson<EditorData>(`/api/admin/electorate-priorities?${query}`, {
      signal: controller.signal,
      feature: "electorate-priorities-admin",
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setDraft(references(result.priorities));
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof HttpError
              ? (failure.serverMessage ?? "Could not load legislative priorities.")
              : "Could not load legislative priorities."
          );
      });
    return () => controller.abort();
  }, [query, retry]);

  const valid =
    draft.length === 4 &&
    new Set(draft.map((p) => p.lawTypeId)).size === 4 &&
    draft.every((p) =>
      data?.laws
        .find((law) => law._id === p.lawTypeId)
        ?.policyOptions.some((option) => option.id === p.policyOptionId)
    );

  async function submit(reset: boolean) {
    if (busy || (!reset && !valid)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await fetchJson<{ priorities: LegislativePriorities; isOverride: boolean }>(
        "/api/admin/electorate-priorities",
        {
          method: reset ? "DELETE" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            countryId,
            regionId,
            bucketId,
            ...(!reset ? { priorities: { primary: draft[0], secondary: draft.slice(1) } } : {}),
          }),
          feature: "electorate-priorities-admin",
        }
      );
      setData((current) =>
        current
          ? {
              ...current,
              priorities: result.priorities,
              isOverride: result.isOverride,
              invalidOverride: false,
            }
          : current
      );
      setDraft(references(result.priorities));
      onSaved(result.priorities);
      setNotice(reset ? "Default priorities restored." : "Legislative priorities saved.");
    } catch (failure) {
      setError(
        failure instanceof HttpError
          ? (failure.serverMessage ?? "Could not save legislative priorities.")
          : "Could not save legislative priorities."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Edit legislative priorities"
      className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4"
    >
      <h4 className="text-sm font-semibold text-red-400">Edit legislative priorities</h4>
      <p className="mt-1 text-xs text-muted">
        Changes apply to this group in this region and survive world resets. Choose a law and its
        desired level for each priority.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-xs text-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-xs text-success">
          {notice}
        </p>
      )}
      {!data ? (
        error ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setRetry((value) => value + 1);
            }}
            className="mt-3 text-xs text-red-400 underline"
          >
            Retry
          </button>
        ) : (
          <p role="status" className="mt-3 text-xs text-muted">
            Loading law options...
          </p>
        )
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(false);
          }}
          className="mt-4 space-y-3"
        >
          {data.invalidOverride && (
            <p className="text-xs text-warning">
              A saved law or level is no longer available. Showing authored defaults until you save
              a valid selection or restore defaults.
            </p>
          )}
          <p className="text-xs text-muted">
            {data.isOverride ? "Using admin-edited priorities." : "Using authored defaults."}
          </p>
          {draft.map((priority, index) => {
            const label = index === 0 ? "Primary" : `Secondary ${index}`;
            const law = data.laws.find((entry) => entry._id === priority.lawTypeId);
            return (
              <fieldset
                key={index}
                disabled={busy}
                className="space-y-2 rounded-lg border border-red-500/20 p-3"
              >
                <legend className="px-1 text-xs font-semibold text-red-400">{label}</legend>
                <label className="block text-xs text-muted">
                  {label} law
                  <select
                    aria-label={`${label} law`}
                    value={priority.lawTypeId}
                    onChange={(event) =>
                      setDraft((current) =>
                        current.map((entry, i) =>
                          i === index
                            ? { lawTypeId: event.target.value, policyOptionId: "" }
                            : entry
                        )
                      )
                    }
                    className="mt-1 w-full min-w-0 rounded-lg border border-card-border bg-card px-2 py-2 text-xs text-foreground"
                  >
                    {!law && <option value={priority.lawTypeId}>Law unavailable</option>}
                    {data.laws.map((entry) => (
                      <option key={entry._id} value={entry._id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-muted">
                  {label} level
                  <select
                    aria-label={`${label} level`}
                    value={priority.policyOptionId}
                    onChange={(event) =>
                      setDraft((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, policyOptionId: event.target.value } : entry
                        )
                      )
                    }
                    className="mt-1 w-full min-w-0 rounded-lg border border-card-border bg-card px-2 py-2 text-xs text-foreground"
                  >
                    <option value="">Choose a level</option>
                    {priority.policyOptionId &&
                      !law?.policyOptions.some(
                        (option) => option.id === priority.policyOptionId
                      ) && <option value={priority.policyOptionId}>Level unavailable</option>}
                    {law?.policyOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            );
          })}
          {!valid && (
            <p className="text-xs text-warning">
              Choose four different laws and a valid level for each.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !valid}
              className="rounded-lg bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-400 disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save priorities"}
            </button>
            <button
              type="button"
              disabled={busy || !data.isOverride}
              onClick={() => void submit(true)}
              className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-400 disabled:opacity-50"
            >
              Restore defaults
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
