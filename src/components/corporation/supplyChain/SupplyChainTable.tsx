"use client";
import { useState } from "react";
import Link from "next/link";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { SupplyChainParty, SupplyChainRow } from "@/lib/corporations/supplyChain/types";
import { CORPORATION_TYPE_LABELS } from "@/lib/constants/corporationsClient";

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const modes = { "open-market": "Open market", agreement: "Agreement", internal: "Internal" };
const quantity = (units: number) => units.toLocaleString(undefined, { maximumFractionDigits: 2 });
export function SupplyChainTable({
  direction,
  rows,
  parties,
  location,
  bySite,
}: {
  direction: "suppliers" | "customers";
  rows: SupplyChainRow[];
  parties: Map<string, SupplyChainParty>;
  location: (country: string, state: string) => string;
  bySite: boolean;
}) {
  const [page, setPage] = useState(0);
  const { formatAmount, formatPrice } = useCurrency();
  const total = rows.filter((r) => r.mode !== "internal").reduce((sum, r) => sum + r.amount, 0);
  const title = direction === "suppliers" ? "Suppliers" : "Customers";
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const visiblePage = Math.min(page, pages - 1);
  const cell = "border-b border-card-border/60 px-2 py-2 text-left align-top";
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          {title}{" "}
          <span className="ml-1 text-body-sm font-normal text-muted">
            {rows.length} {rows.length === 1 ? "relationship" : "relationships"}
          </span>
        </h3>
        <span className="text-body-sm text-muted">
          {direction === "suppliers" ? "Purchases" : "Receipts"} this turn: {formatAmount(total)}
        </span>
      </div>
      {!rows.length ? (
        <p className="rounded border border-card-border py-6 text-center text-body text-muted">
          No {direction} match these filters in this turn.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-body-sm">
              <caption className="sr-only">{title} from actual settled deliveries</caption>
              <thead className="bg-card-elevated text-muted">
                <tr>
                  {bySite && (
                    <th scope="col" className={cell}>
                      Your sector / location
                    </th>
                  )}
                  <th scope="col" className={cell}>
                    {direction === "suppliers" ? "Supplier" : "Customer"}
                  </th>
                  <th scope="col" className={cell}>
                    Commodity
                  </th>
                  <th scope="col" className={cell}>
                    Trade type
                  </th>
                  <th scope="col" className={cell}>
                    Units this turn
                  </th>
                  <th scope="col" className={cell}>
                    Average price
                  </th>
                  <th scope="col" className={cell}>
                    Total this turn
                  </th>
                  <th scope="col" className={cell}>
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(visiblePage * 25, (visiblePage + 1) * 25).map((row) => {
                  const party = parties.get(row.counterpartyId);
                  const name = party?.name ?? "Former market participant";
                  return (
                    <tr key={row.key} className="hover:bg-card-elevated/50">
                      {bySite && (
                        <td className={cell}>
                          {row.site && (
                            <>
                              <span>
                                {CORPORATION_TYPE_LABELS[
                                  row.site.sectorType as keyof typeof CORPORATION_TYPE_LABELS
                                ] ?? label(row.site.sectorType)}
                              </span>
                              <span className="mt-1 block text-muted">
                                {location(row.site.countryId, row.site.stateId)}
                              </span>
                            </>
                          )}
                        </td>
                      )}
                      <td className={cell}>
                        {party?.href ? (
                          <Link className="font-medium hover:underline" href={party.href}>
                            {name}
                          </Link>
                        ) : (
                          <span className="font-medium">{name}</span>
                        )}
                        <span className="mt-1 block text-muted">
                          {location(row.counterpartyCountry, row.counterpartyState)}
                        </span>
                      </td>
                      <td className={cell}>{label(row.commodity)}</td>
                      <td className={cell}>
                        <span className="rounded border border-card-border px-1.5 py-0.5">
                          {modes[row.mode]}
                        </span>
                      </td>
                      <td className={`${cell} tabular-nums`}>{quantity(row.units)}</td>
                      <td className={`${cell} tabular-nums`}>
                        {row.mode === "internal"
                          ? "No cash payment"
                          : formatPrice(row.units > 0 ? row.amount / row.units : 0)}
                      </td>
                      <td className={`${cell} tabular-nums`}>
                        {row.mode === "internal" ? "No cash payment" : formatAmount(row.amount)}
                      </td>
                      <td className={`${cell} tabular-nums`}>
                        {row.mode === "internal" || total <= 0
                          ? "N/A"
                          : `${((100 * row.amount) / total).toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-3 text-body-sm">
              <button
                disabled={visiblePage === 0}
                onClick={() => setPage(visiblePage - 1)}
                className="disabled:opacity-40"
              >
                Previous
              </button>
              <span>
                Page {visiblePage + 1} of {pages}
              </span>
              <button
                disabled={visiblePage + 1 >= pages}
                onClick={() => setPage(visiblePage + 1)}
                className="disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
