import { BondProfilePanel } from "../BondProfilePanel";
import { FxReserveTransferPanel } from "../FxReserveTransferPanel";

export function DebtFxTab({
  countryCode,
  positionId,
  canAct,
  sovereignBondProfile,
  sovereignBondMaturities,
  debtPrincipal,
  sovereignBondsOutstanding,
  onUpdate,
}: {
  countryCode: string;
  positionId: string;
  canAct: boolean;
  sovereignBondProfile: Record<number, number> | null;
  sovereignBondMaturities?: number[];
  debtPrincipal: number;
  sovereignBondsOutstanding: number;
  onUpdate: () => void;
}) {
  return (
    <div className="space-y-4">
      <BondProfilePanel
        countryCode={countryCode}
        positionId={positionId}
        canAct={canAct}
        currentProfile={sovereignBondProfile}
        maturities={sovereignBondMaturities}
        debtPrincipal={debtPrincipal}
        sovereignBondsOutstanding={sovereignBondsOutstanding}
        onUpdate={onUpdate}
      />
      <FxReserveTransferPanel countryCode={countryCode} canAct={canAct} onUpdate={onUpdate} />
    </div>
  );
}
