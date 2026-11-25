"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ElectricityReport } from "@/lib/electricityNetwork/rules/report";
import type { ElectricityNetwork } from "@/lib/electricityNetwork/rules/types";
interface ReportResponse {
  states?: { id: string; name: string; countryId: string }[];
  reports: { turn: number; report: ElectricityReport }[];
  companies: { id: string; name: string }[];
}
const number = (v: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(v);
const delta = (a: number, b: number) => `${b - a > 0 ? "+" : ""}${number(b - a)}`;
const tableClass = "w-full text-left text-body-sm";
export function ElectricityNetworkAdminPanel() {
  const [data, setData] = useState<ReportResponse>({ reports: [], companies: [] }),
    [network, setNetwork] = useState<ElectricityNetwork | null>(null),
    [selected, setSelected] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [filter, setFilter] = useState("");
  function load() {
    return Promise.all([
      fetch("/api/admin/electricity-network/reports", { cache: "no-store" }),
      fetch("/api/admin/electricity-network", { cache: "no-store" }),
    ]).then(async ([a, b]) => {
      if (!a.ok || !b.ok) throw Error("Could not load electricity reports.");
      const reports: ReportResponse = await a.json();
      const config: { network: ElectricityNetwork } = await b.json();
      return { reports, network: config.network };
    });
  }
  function accept(value: { reports: ReportResponse; network: ElectricityNetwork }) {
    setData(value.reports);
    setNetwork(value.network);
    setSelected(0);
  }
  function refresh() {
    setBusy(true);
    setError("");
    void load()
      .then(accept)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load reports."))
      .finally(() => setBusy(false));
  }
  useEffect(() => {
    let active = true;
    void load()
      .then((value) => {
        if (active) accept(value);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Could not load reports.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const entry = data.reports[selected],
    report = entry?.report;
  const names = new Map(data.companies.map((c) => [c.id, c.name]));
  const name = (id: string) => names.get(id) ?? id;
  const locations = new Map(data.states?.map((s) => [s.id, s.name]) ?? []);
  const location = (id: string) => locations.get(id) ?? id;
  const match = (...values: string[]) =>
    values.some((v) => v.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-heading font-semibold">Electricity network</h2>
          <p className="text-muted text-body-sm">
            Current setting: {network?.mode ?? "Loading"}. Comparisons below retain the mode and
            network frozen for each settled turn.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={refresh}
          className="rounded border border-card-border px-3 py-2 disabled:opacity-50"
        >
          {busy ? "Loading" : "Refresh"}
        </button>
      </header>
      <p className="text-body-sm text-muted">
        Change the mode on the{" "}
        <Link href="/control/overview/dashboard" className="text-primary underline">
          dashboard kill-switch board
        </Link>
        . Shadow settles the existing market and runs the grid comparison separately. Enforced
        settles the grid result and compares with Off. Money is common market anchor value, not a
        company wallet currency.
      </p>
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      {data.reports.length > 0 ? (
        <label className="flex gap-3 items-center">
          Settled turn
          <select
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
            className="bg-background border border-card-border rounded p-2"
          >
            {data.reports.map((r, i) => (
              <option key={r.turn} value={i}>
                Turn {r.turn}: {r.report.mode}, {r.report.status}
              </option>
            ))}
          </select>
        </label>
      ) : (
        !busy && (
          <p className="rounded border border-card-border p-4">
            No settled comparison in this world yet. Reports appear after a producer settlement in
            Shadow or Enforced mode. Off and unfinished turns have no completed comparison.
          </p>
        )
      )}
      {report && (
        <>
          <div className="rounded border border-card-border p-4 space-y-2">
            <h3 className="font-semibold">
              Turn {entry.turn}: {report.status}
            </h3>
            <p className="text-body-sm">
              Frozen mode: {report.mode}. Network: {report.version}, year {report.year}.
            </p>
            {report.reason && (
              <p role="status" className="text-amber-400">
                {report.reason}
              </p>
            )}
            {report.status === "planning-limit" && (
              <p className="text-amber-400">
                Provisional: a production plan reached its compute or pass limit. Compare
                directions, not precise forecasts.
              </p>
            )}
            {report.notes.map((note) => (
              <p key={note} className="text-body-sm text-muted">
                {note}
              </p>
            ))}
          </div>
          <div className="overflow-x-auto rounded border border-card-border p-4">
            <h3 className="font-semibold mb-3">Off versus grid</h3>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>Measure</th>
                  <th>Off</th>
                  <th>Grid</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Electricity dispatched (MWh)", "dispatched"],
                    ["Electricity delivered (MWh)", "delivered"],
                    ["Transmission losses (MWh)", "losses"],
                    ["Electricity paid (anchor value)", "tradeValue"],
                    ["Average paid price / delivered MWh", "averagePrice"],
                    ["Sites producing less than Off", "sitesProducingLess"],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key} className="border-t border-card-border">
                    <td className="py-2 pr-4">{label}</td>
                    <td>{report.off ? number(report.off[key]) : "Unavailable"}</td>
                    <td>{report.grid ? number(report.grid[key]) : "Unavailable"}</td>
                    <td>
                      {report.off && report.grid
                        ? delta(report.off[key], report.grid[key])
                        : "Unavailable"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="block">
            Filter companies, countries, states or sector types
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mt-2 block w-full rounded border border-card-border bg-background p-2"
              placeholder="Company, CA, Ontario, energy..."
            />
          </label>
          <ReportTable
            title="Companies"
            headings={[
              "Company",
              "Power received Off / Grid",
              "Electricity revenue Off / Grid",
              "Total revenue change",
              "Profit change",
            ]}
            rows={report.companies
              .filter((c) => match(name(c.corporationId), c.corporationId))
              .map((c) => [
                name(c.corporationId),
                `${number(c.powerOff)} / ${number(c.powerGrid)}`,
                `${number(c.energyRevenueOff)} / ${number(c.energyRevenueGrid)}`,
                delta(c.revenueOff, c.revenueGrid),
                delta(c.profitOff, c.profitGrid),
              ])}
          />
          <ReportTable
            title="Sector and location"
            headings={[
              "Company / sector",
              "Country / state",
              "Power Off / Grid",
              "Output Off / Grid",
              "Profit change",
            ]}
            rows={report.sites
              .filter((s) =>
                match(
                  name(s.corporationId),
                  s.countryId,
                  location(s.stateId),
                  s.stateId,
                  s.sectorType
                )
              )
              .map((s) => [
                `${name(s.corporationId)} / ${s.sectorType}`,
                `${s.countryId} / ${location(s.stateId)}`,
                `${number(s.powerOff)} / ${number(s.powerGrid)}`,
                `${number(s.outputOff)} / ${number(s.outputGrid)}`,
                delta(s.profitOff, s.profitGrid),
              ])}
          />
          <ReportTable
            title="Electricity routes"
            headings={["Source", "Destination", "Connected", "Off MWh", "Grid MWh"]}
            rows={report.routes
              .filter((r) =>
                match(
                  r.from,
                  r.to,
                  location(r.fromState),
                  location(r.toState),
                  r.fromState,
                  r.toState
                )
              )
              .map((r) => [
                `${r.from} ${location(r.fromState)}`,
                `${r.to} ${location(r.toState)}`,
                r.connected ? "Yes" : "No",
                number(r.unitsOff),
                number(r.unitsGrid),
              ])}
          />
          {Object.values(report.omitted).some((n) => n > 0) && (
            <p className="text-amber-400 text-body-sm">
              Report row limits: {report.omitted.companies} companies, {report.omitted.sites} sites
              and {report.omitted.routes} routes omitted. Totals include all deliveries.
            </p>
          )}
          {report.lines && (
            <ReportTable
              title="Shared link usage in grid clearing"
              headings={["Connection", "Dispatched MWh", "Capacity MWh", "Utilization", "Lost MWh"]}
              rows={report.lines.lines
                .filter((l) => match(l.id))
                .map((l) => [
                  l.id,
                  number(l.dispatched),
                  number(l.capacity),
                  l.capacity ? `${number((l.dispatched / l.capacity) * 100)}%` : "0%",
                  number(l.lossUnits),
                ])}
            />
          )}
        </>
      )}
      {network && (
        <details className="rounded border border-card-border p-4">
          <summary className="cursor-pointer font-semibold">
            Current connection catalog and modeling assumptions
          </summary>
          <div className="mt-3 space-y-2">
            {network.notes.map((n) => (
              <p key={n} className="text-body-sm text-muted">
                {n}
              </p>
            ))}
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>Connection</th>
                  <th>MWh / turn</th>
                  <th>Modeled loss</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {network.links.map((l) => (
                  <tr key={l.id} className="border-t border-card-border">
                    <td className="py-2">{l.name}</td>
                    <td>{number(l.capacity)}</td>
                    <td>{number(l.loss * 100)}%</td>
                    <td>
                      <a
                        href={l.source}
                        rel="noreferrer"
                        target="_blank"
                        className="text-primary underline"
                      >
                        Reference
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
function ReportTable({
  title,
  headings,
  rows,
}: {
  title: string;
  headings: string[];
  rows: string[][];
}) {
  return (
    <section className="rounded border border-card-border p-4">
      <h3 className="font-semibold mb-3">{title}</h3>
      <div className="overflow-auto max-h-96">
        <table className={tableClass}>
          <thead>
            <tr>
              {headings.map((h) => (
                <th key={h} className="pr-4 pb-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-card-border">
                {r.map((c, j) => (
                  <td key={j} className="py-2 pr-4">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-body-sm text-muted">No comparison rows for this selection.</p>
        )}
      </div>
    </section>
  );
}
