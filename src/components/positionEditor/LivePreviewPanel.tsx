"use client";
import {
  formatLeanValue,
  getLeanLabel,
  getSocialLeanLabel,
  getDisplayLean,
} from "@/lib/utils/demographics";
import { LeanSpectrum } from "./LeanSpectrum";
import type { DerivedComposition } from "@/lib/positionEditor/types";

export function LivePreviewPanel({ derived }: { derived: DerivedComposition }) {
  const display = getDisplayLean(derived.stateEconomicLean, derived.stateSocialLean);
  return (
    <div className="sticky top-4 rounded-xl border border-card-border bg-card p-4 shadow-card">
      <p className="text-body-sm font-medium text-muted">Live state lean</p>
      <p className="mb-3 text-[11px] text-muted">
        Census buckets with your edits applied · recomputed on every change
      </p>
      <div className="space-y-3 text-sm">
        <div>
          <div className="flex justify-between">
            <span className="text-muted">Economic</span>
            <span className="tabular-nums text-foreground">
              {formatLeanValue(derived.stateEconomicLean)} ·{" "}
              {getLeanLabel(derived.stateEconomicLean)}
            </span>
          </div>
          <LeanSpectrum value={derived.stateEconomicLean} axis="economic" />
        </div>
        <div>
          <div className="flex justify-between">
            <span className="text-muted">Social</span>
            <span className="tabular-nums text-foreground">
              {formatLeanValue(derived.stateSocialLean)} ·{" "}
              {getSocialLeanLabel(derived.stateSocialLean)}
            </span>
          </div>
          <LeanSpectrum value={derived.stateSocialLean} axis="social" />
        </div>
        <div className="flex justify-between border-t border-card-border pt-2">
          <span className="text-muted">Display</span>
          <span className="tabular-nums text-foreground">{formatLeanValue(display)}</span>
        </div>
        {derived.buckets.map((section) => (
          <div key={section.dim} className="border-t border-card-border pt-2">
            <p className="mb-1 text-[11px] font-medium text-muted">{section.dimLabel}</p>
            <table className="w-full text-[11px] tabular-nums">
              <thead className="text-muted">
                <tr>
                  <th className="text-left font-normal">Bucket</th>
                  <th className="text-right font-normal">Share</th>
                  <th className="text-right font-normal">Econ</th>
                  <th className="text-right font-normal">Soc</th>
                  <th className="text-right font-normal">Turnout</th>
                </tr>
              </thead>
              <tbody>
                {section.buckets.map((b) => (
                  <tr key={b.id}>
                    <td className="truncate pr-2 text-foreground">{b.label}</td>
                    <td className="text-right">{b.sharePct.toFixed(1)}%</td>
                    <td className="text-right">{formatLeanValue(b.economicLean)}</td>
                    <td className="text-right">{formatLeanValue(b.socialLean)}</td>
                    <td className="text-right">{b.turnout.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
