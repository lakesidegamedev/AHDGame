import type { SovereignRiskDisclosure } from "@/lib/bonds/sovereignRiskDisclosure";

export function SovereignBondRisk({
  risk,
  compact = false,
}: {
  risk?: SovereignRiskDisclosure | null;
  compact?: boolean;
}) {
  return (
    <div className="text-xs text-warning" role="note">
      <span className="font-semibold">
        Issuer credit: {risk?.creditRating ?? "Not rated"}
        {risk?.creditRating && ["BB", "B", "CCC"].includes(risk.creditRating)
          ? " (speculative grade)"
          : ""}
      </span>
      {risk?.crisisState && <span> | {risk.crisisState.replace(/([A-Z])/g, " $1")}</span>}
      <span>
        {" "}
        |{" "}
        {risk?.lastDefaultTurn != null
          ? `Last sovereign default: turn ${risk.lastDefaultTurn}`
          : risk
            ? "No recorded sovereign default"
            : "Default history unavailable"}
      </span>
      {!compact && (
        <p className="mt-1">
          Ratings can change. A high yield can reflect repayment risk. Default or restructuring can
          reduce or delay payments.
        </p>
      )}
    </div>
  );
}
