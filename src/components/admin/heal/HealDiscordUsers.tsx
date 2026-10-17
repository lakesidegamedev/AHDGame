"use client";

import { HealPanelActions, HealPanelMessage } from "./HealPanelParts";

import { useHealPanel } from "./useHealPanel";

interface DiagnosticResult {
  status: string;
  message: string;
  usersWithoutActiveCharacterId: number;
  brokenActiveCharacterIdLinks: number;
  charactersMissingCountryId: number;
  totalUsersChecked: number;
  totalCharactersChecked: number;
}

export function HealDiscordUsers() {
  const { loading, diagnostic, result, runDiagnostic, runHeal } = useHealPanel<DiagnosticResult>(
    "/api/admin/heal/discord-users",
    "This will backfill missing activeCharacterId links, fix broken character references, and add missing countryId to characters.\n\nContinue?"
  );

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Heal player account linkage</h3>
        <p className="mt-1 text-xs text-muted">
          Detects and fixes missing activeCharacterId links, broken character references, and
          characters missing countryId. Affects Discord-registered and legacy accounts.
        </p>
      </div>

      <HealPanelActions loading={loading} onDiagnose={runDiagnostic} onHeal={runHeal} />

      {diagnostic && (
        <div className="rounded-lg border border-card-border bg-background p-3 text-xs space-y-1">
          <p className={diagnostic.status === "ok" ? "text-success" : "text-error"}>
            {diagnostic.message}
          </p>
          {diagnostic.status !== "ok" && (
            <div className="text-muted text-xs space-y-0.5 mt-2">
              <p>
                • Missing activeCharacterId:{" "}
                <span className="font-semibold">{diagnostic.usersWithoutActiveCharacterId}</span>
              </p>
              <p>
                • Broken character links:{" "}
                <span className="font-semibold">{diagnostic.brokenActiveCharacterIdLinks}</span>
              </p>
              <p>
                • Characters missing countryId:{" "}
                <span className="font-semibold">{diagnostic.charactersMissingCountryId}</span>
              </p>
            </div>
          )}
        </div>
      )}

      <HealPanelMessage result={result} />
    </div>
  );
}
