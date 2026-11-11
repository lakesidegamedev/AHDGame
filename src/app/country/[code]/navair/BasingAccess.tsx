"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiErrorText } from "@/lib/errors/catalog";
import type { BasingAgreement, BaseDomain } from "@/lib/navair/rules/supply";

export function BasingAccess({
  country,
  positionId,
  agreements,
  countries,
  enabled,
}: {
  country: string;
  positionId: string;
  agreements: BasingAgreement[];
  countries: Array<{ id: string; name: string }>;
  enabled: boolean;
}) {
  const router = useRouter();
  const [guest, setGuest] = useState(countries[0]?.id ?? "");
  const [domain, setDomain] = useState<BaseDomain>("naval");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(
    host: string,
    guest: string,
    domain: BaseDomain,
    action: "offer" | "accept" | "revoke"
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/country/${country}/executive/cabinet/${positionId}/navair/basing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host, guest, domain, action }),
        }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(apiErrorText(body, "Basing access was refused."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the ministry.");
    } finally {
      setBusy(false);
    }
  }
  const name = (id: string) => countries.find((c) => c.id === id)?.name ?? id;
  return (
    <section className="mt-6 rounded border border-neutral-700 p-4 text-sm">
      <h2 className="font-semibold">Friendly-base access</h2>
      <p className="mt-1 text-neutral-400">
        Offer access to your home-region ports or airbases. The other nation must accept. Either
        nation can revoke access, and access stops applying while the nations are at war. Active
        agreements apply from the next turn. Port capacity is shared.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label>
          Guest nation{" "}
          <select
            aria-label="Guest nation"
            value={guest}
            onChange={(e) => setGuest(e.target.value)}
            className="bg-neutral-900"
          >
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Service{" "}
          <select
            aria-label="Basing service"
            value={domain}
            onChange={(e) => setDomain(e.target.value as BaseDomain)}
            className="bg-neutral-900"
          >
            <option value="naval">Naval ports</option>
            <option value="air">Airbases</option>
          </select>
        </label>
        <button
          disabled={!enabled || busy || !guest}
          onClick={() => act(country, guest, domain, "offer")}
          className="rounded border p-1"
        >
          Offer access
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-red-400">
          {error}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {agreements
          .filter((a) => a.status !== "revoked")
          .map((a) => (
            <li key={a._id}>
              {name(a.host)} hosts {name(a.guest)}: {a.domain}, {a.status}.
              {a.status === "offered" && a.guest === country && (
                <button
                  disabled={!enabled || busy}
                  onClick={() => act(a.host, a.guest, a.domain, "accept")}
                  className="ml-2 underline"
                >
                  Accept
                </button>
              )}
              <button
                disabled={!enabled || busy}
                onClick={() => act(a.host, a.guest, a.domain, "revoke")}
                className="ml-2 underline"
              >
                {a.status === "offered" ? "Cancel / decline" : "Revoke"}
              </button>
            </li>
          ))}
      </ul>
    </section>
  );
}
