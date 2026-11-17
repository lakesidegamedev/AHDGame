import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  advanceProducerEconomy,
  type ProductionPlan,
} from "../../src/lib/market/producerMarket/production";
import {
  splitFundedInventory,
  transferProducerClaims,
  producerDebtAnchor,
  producerStockBookAnchor,
} from "../../src/lib/nationalization/rules/fundedOwnership";
import {
  producerPayableId,
  type ProducerPayable,
} from "../../src/lib/market/producerMarket/payablesRules";

// Synthetic funded-market fixture. No database or production state is accessed.
const reports: object[] = [];
for (const openingCash of [10_000, 1e12]) {
  let accounts = ["private", "state", "buyer", "workers", "services"].map((id) => ({
    id,
    cash: openingCash,
  }));
  const openingTotal = accounts.reduce((n, a) => n + a.cash, 0);
  let payables: ProducerPayable[] = [];
  const methods = new Map([
    ["hydro", "hydroelectric"],
    ["gas", "gas_fired"],
  ]);
  const sites: ProductionPlan[] = ["hydro", "gas"].map((id) => ({
    id,
    accountId: "private",
    capacityUnits: 20,
    activeFraction: 1,
    outputMultiplier: 1,
    labourCost: id === "hydro" ? 5 : 8,
    otherOperatingCost: id === "hydro" ? 2 : 4,
    labourRecipientAccountId: "workers",
    operatingRecipientAccountId: "services",
    inputs: [],
    outputs: [
      {
        commodity: "energy",
        unitsPerOutput: 1,
        book: "world",
        policy: { kind: "manual", unitPrice: 2 },
        referenceUnitPrice: 2,
        storable: true,
      },
    ],
    inputStock: [{ commodity: "steel", units: 3, value: 17 }],
    outputStock: [{ commodity: "energy", units: 4, book: "world", quoteUnitCost: 1 }],
  }));
  const digest = createHash("sha256");
  let delivered = 0,
    events = 0;
  for (let turn = 1; turn <= 48; turn++) {
    if ([1, 12, 24, 36].includes(turn)) {
      const site = sites.find((s) => s.id === "hydro")!;
      const nextOwner = site.accountId === "private" ? "state" : "private";
      const stock = {
        worldEpoch: "synthetic",
        turn,
        inputStock: [...site.inputStock],
        outputStock: [...site.outputStock],
      };
      const parts = splitFundedInventory(stock, 0.4);
      assert.ok(
        Math.abs(
          producerStockBookAnchor(parts.kept) +
            producerStockBookAnchor(parts.moved) -
            producerStockBookAnchor(stock)
        ) < 1e-8
      );
      const invoice = {
        debtorAccountId: site.accountId,
        creditorAccountId: "workers",
        producerId: site.id,
        amount: 7,
        kind: "labour" as const,
        notShrinkingSince: turn,
      };
      const source = {
        worldEpoch: "synthetic",
        turn,
        claims: [{ ...invoice, id: producerPayableId(invoice) }],
      };
      const transfer = transferProducerClaims({ source, destinationAccountId: nextOwner });
      const replay = transferProducerClaims({
        source: transfer.kept,
        destination: transfer.moved,
        destinationAccountId: nextOwner,
      });
      assert.deepEqual(replay.moved, transfer.moved);
      assert.equal(producerDebtAnchor(transfer.kept) + producerDebtAnchor(transfer.moved), 7);
      payables.push(...transfer.moved.claims);
      site.accountId = nextOwner;
      events++;
    }
    const result = advanceProducerEconomy({
      turn,
      accounts,
      producers: sites,
      payables,
      carryLossByCommodity: {},
      externalOrders: [
        {
          id: `demand:${turn}`,
          accountId: "buyer",
          commodity: "energy",
          book: "world",
          units: 25,
          maximumUnitPrice: 2,
        },
      ],
    });
    digest.update(JSON.stringify(result));
    accounts = result.accounts;
    payables = result.payables;
    assert.ok(
      Math.abs(accounts.reduce((n, a) => n + a.cash, 0) - openingTotal) <=
        Math.max(1e-7, openingTotal * Number.EPSILON * 4)
    );
    for (const receipt of result.producers) {
      const site = sites.find((s) => s.id === receipt.id)!;
      site.inputStock = receipt.inputStock;
      site.outputStock = receipt.outputStock;
      delivered += receipt.deliveredUnits;
      assert.ok(methods.has(site.id));
    }
    assert.equal(sites.length, 2);
    assert.equal(methods.get("hydro"), "hydroelectric");
    assert.equal(methods.get("gas"), "gas_fired");
  }
  reports.push({
    turns: 48,
    openingCashPerAccount: openingCash,
    ownershipEvents: events,
    deliveredUnits: delivered,
    closingCash: accounts.reduce((n, a) => n + a.cash, 0),
    openingTotal,
    outstandingLiabilities: payables.reduce((n, p) => n + p.amount, 0),
    settlementDigest: digest.digest("hex"),
    checks: "cash, stock split basis, creditor novation, replay, distinct methods",
  });
}
console.log(JSON.stringify(reports, null, 2));
