import { getHomeCurrency } from "@/lib/currency/characterFunds";
import type { ActionCard, ActionCardProps, ActionsViewMode } from "./actionsTypes";
import type { ActionsController } from "./useActionsController";

/**
 * The props one Actions card renders with, from the shared controller. Callers
 * only reach this once `controller.ready` is true, so the character and the
 * cost quotes are present.
 */
export function actionCardProps(
  c: ActionsController,
  card: ActionCard,
  index: number,
  viewMode: ActionsViewMode
): ActionCardProps {
  const character = c.character!;
  const costs = c.actionCosts!;
  return {
    card,
    imageUrl: c.cardImages[card.type],
    index,
    viewMode,
    character,
    homeState: c.homeState,
    executing: c.executing,
    flash: c.flash,
    flipflopStep: c.flipflopStep,
    flipflopAxis: c.flipflopAxis,
    flipflopDir: c.flipflopDir,
    onOpenCampaignAction: c.setCampaignAction,
    onExecute: (type, count) => void c.execute(type, count),
    onFlipflop: (axis, direction) => void c.executeFlipflop(axis, direction),
    onFlipflopStepChange: c.setFlipflopStep,
    onFlipflopAxisChange: c.setFlipflopAxis,
    onFlipflopDirChange: c.setFlipflopDir,
    campaignActionCost: costs.campaignActionCost,
    campaignFundCost: costs.campaignFundCost,
    campaignMaxed: costs.campaignMaxed,
    advertiseActionCost: costs.advertiseActionCost,
    advertiseFundCost: costs.advertiseFundCost,
    fundraiseActionCost: costs.fundraiseActionCost,
    buildDonorBaseActionCost: costs.buildDonorBaseActionCost,
    buildDonorBaseFundCost: costs.buildDonorBaseFundCost,
    fundraiseYield: costs.fundraiseAmount,
    campaignCurrency: getHomeCurrency(character),
    displayCampaignFunds: c.displayCampaignFunds,
    displayPersonalWealth: c.displayPersonalWealth,
    blockGdpScaledCosts: c.blockGdpScaledCosts,
    forexEnabled: c.forexEnabled,
    convertCashOpen: c.convertCashOpen,
    convertCashAmount: c.convertCashAmount,
    onConvertCashOpenChange: c.setConvertCashOpen,
    onConvertCashAmountChange: c.setConvertCashAmount,
    onConvertCashExecute: (amount) => void c.executeConvertCash(amount),
    projection: c.projections[card.type],
  };
}
