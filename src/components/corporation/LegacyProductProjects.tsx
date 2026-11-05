"use client";

import { useCallback, useEffect, useState } from "react";
import { DenseSection, InlineStatus, SmallButton, TableScroll, Td, Th } from "./dense/DenseKit";
import { apiErrorText } from "@/lib/errors/catalog";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { PRODUCT_DEVELOPMENT_MAX_RD_SHARE } from "@/lib/products/rules/productBudgets";

interface LegacyProject {
  key: string;
  label: string;
  stage: string;
  /** Development cost paid so far, in anchor currency. */
  paidAnchor: number;
  /** Total development cost, in anchor currency. */
  thresholdAnchor: number;
  retireUrl: string;
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Product projects started before the product studio keep running until they
 * retire. They can no longer be started, so this only lists and retires them.
 * Shown at the top of the studio because one still in development takes part
 * of the R&D budget every turn.
 */
export function LegacyProductProjects({
  corporationId,
  currencyCode,
}: {
  corporationId: string;
  currencyCode?: string | null;
}) {
  const { formatAmount } = useCurrency();
  const [projects, setProjects] = useState<LegacyProject[]>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const found: LegacyProject[] = [];
    const media = await fetch(`/api/corporations/${corporationId}/media-products`, {
      cache: "no-store",
    }).catch((error: unknown) => {
      console.error("[LegacyProductProjects] media projects failed to load", error);
      return null;
    });
    if (media?.ok) {
      const data = (await media.json()) as {
        enabled?: boolean;
        projects?: Array<{
          _id: string;
          title: string;
          kindLabel: string;
          stage: string;
          developmentPaidAnchor?: number;
          paidThresholdAnchor?: number;
        }>;
      };
      for (const project of data.projects ?? []) {
        if (project.stage === "retired") continue;
        found.push({
          key: `media-${project._id}`,
          label: `${project.title} (${project.kindLabel})`,
          stage: project.stage,
          paidAnchor: finite(project.developmentPaidAnchor),
          thresholdAnchor: finite(project.paidThresholdAnchor),
          retireUrl: `/api/corporations/${corporationId}/media-products/${project._id}/retire`,
        });
      }
    }
    const manufacturing = await fetch(`/api/corporations/${corporationId}/products`, {
      cache: "no-store",
    }).catch((error: unknown) => {
      console.error("[LegacyProductProjects] product projects failed to load", error);
      return null;
    });
    if (manufacturing?.ok) {
      const data = (await manufacturing.json()) as {
        activeProject?: {
          id: string;
          kindLabel: string;
          stage: string;
          developmentPaidAnchor?: number;
          paidThresholdAnchor?: number;
        } | null;
      };
      const project = data.activeProject;
      if (project && project.stage !== "retired") {
        found.push({
          key: `mfg-${project.id}`,
          label: project.kindLabel,
          stage: project.stage,
          paidAnchor: finite(project.developmentPaidAnchor),
          thresholdAnchor: finite(project.paidThresholdAnchor),
          retireUrl: `/api/corporations/${corporationId}/products/${project.id}/retire`,
        });
      }
    }
    return found;
  }, [corporationId]);

  useEffect(() => {
    let active = true;
    void load().then((found) => {
      if (active) setProjects(found);
    });
    return () => {
      active = false;
    };
  }, [load]);

  async function retire(project: LegacyProject) {
    setMessage("");
    const response = await fetch(project.retireUrl, { method: "POST" });
    if (!response.ok) {
      setMessage(apiErrorText(await response.json().catch(() => ({})), "Could not retire it."));
      return;
    }
    setProjects(await load());
  }

  if (projects.length === 0) return null;
  const money = (anchor: number) =>
    formatAmount(anchor, (currencyCode ?? undefined) as CurrencyCode | undefined);
  const developing = projects.filter((project) => project.stage === "development");
  const sharePct = Math.round(PRODUCT_DEVELOPMENT_MAX_RD_SHARE * 100);
  return (
    <DenseSection title="Earlier product projects" meta="started before the product studio">
      {developing.length > 0 && (
        <p className="py-1 text-sm text-warning">
          {developing.length === 1
            ? `${developing[0]!.label} is still in development. Until it is paid for, it uses up to ${sharePct}% of your R&D budget each turn, and the rest goes to research. Retire it to give research the whole budget again.`
            : `${developing.length} earlier projects are still in development. Until they are paid for, they share up to ${sharePct}% of your R&D budget each turn, and the rest goes to research. Retire them to give research the whole budget again.`}
        </p>
      )}
      <p className="py-1 text-sm text-muted">
        These keep running until they retire and cannot be restarted. Start new products in the
        studio below.
      </p>
      <InlineStatus message={message} tone="error" className="py-1" />
      <TableScroll>
        <table className="w-full text-sm" aria-label="Earlier product projects">
          <thead>
            <tr>
              <Th>Project</Th>
              <Th>Stage</Th>
              <Th align="right">Development paid</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.key}>
                <Td numeric={false} wrap>
                  {project.label}
                </Td>
                <Td numeric={false} className="capitalize text-muted">
                  {project.stage.replace(/_/g, " ")}
                </Td>
                <Td align="right">
                  {project.thresholdAnchor > 0
                    ? `${money(Math.min(project.paidAnchor, project.thresholdAnchor))} of ${money(project.thresholdAnchor)}`
                    : "None"}
                </Td>
                <Td align="right" numeric={false}>
                  <SmallButton
                    onClick={() => void retire(project)}
                    title="Stops the project. It cannot be restarted."
                  >
                    Retire
                  </SmallButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </DenseSection>
  );
}
