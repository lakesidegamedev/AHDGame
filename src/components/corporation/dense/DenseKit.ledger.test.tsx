/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DenseSection, KVList, KVRow, StatementLine } from "./DenseKit";
import { CorpLedgerProvider, useCorpLedger } from "../ledger/LedgerContext";

function Probe() {
  return <span data-testid="probe">{String(useCorpLedger())}</span>;
}

describe("DenseKit ledger variants", () => {
  it("KVRow draws a dotted leader only inside CorpLedgerProvider", () => {
    const row = (
      <KVList>
        <KVRow label="Cash" value="$1" />
      </KVList>
    );
    const plain = render(row);
    expect(plain.container.querySelector("[data-ledger-leader]")).toBeNull();
    plain.unmount();

    const ledger = render(<CorpLedgerProvider>{row}</CorpLedgerProvider>);
    expect(ledger.container.querySelector("[data-ledger-leader]")).not.toBeNull();
  });

  it("DenseSection drops the accent pip in the ledger", () => {
    const section = (
      <DenseSection title="Key statistics">
        <p>body</p>
      </DenseSection>
    );
    const plain = render(section);
    expect(plain.container.querySelector(".bg-primary\\/80")).not.toBeNull();
    plain.unmount();

    const ledger = render(<CorpLedgerProvider>{section}</CorpLedgerProvider>);
    expect(ledger.container.querySelector(".bg-primary\\/80")).toBeNull();
  });

  it("useCorpLedger is false by default", () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("probe").textContent).toBe("false");
  });

  it("CorpLedgerProvider marks its root for the scoped styles", () => {
    const { container } = render(
      <CorpLedgerProvider>
        <Probe />
      </CorpLedgerProvider>
    );
    expect(container.querySelector("[data-corp-ledger]")).not.toBeNull();
    expect(container.querySelector("[data-testid=probe]")?.textContent).toBe("true");
  });
});

describe("StatementLine ledger bar", () => {
  const line = (pct: string | null) => (
    <table>
      <tbody>
        <StatementLine label="Wages" amount="$18.4M" pct={pct} />
      </tbody>
    </table>
  );

  it("draws a share-of-revenue bar only in the ledger", () => {
    const plain = render(line("38.2%"));
    expect(plain.container.querySelector("[data-fill]")).toBeNull();
    plain.unmount();
    const ledger = render(<CorpLedgerProvider>{line("38.2%")}</CorpLedgerProvider>);
    expect(ledger.container.querySelector<HTMLElement>("[data-fill]")!.style.width).toBe("38.2%");
    expect(ledger.getByText("38.2%")).toBeTruthy();
  });

  it("sizes a negative share by its magnitude and skips a missing one", () => {
    const neg = render(<CorpLedgerProvider>{line("-3.1%")}</CorpLedgerProvider>);
    expect(neg.container.querySelector<HTMLElement>("[data-fill]")!.style.width).toBe("3.1%");
    neg.unmount();
    const none = render(<CorpLedgerProvider>{line(null)}</CorpLedgerProvider>);
    expect(none.container.querySelector("[data-fill]")).toBeNull();
  });
});
