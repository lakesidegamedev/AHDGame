import RegionalShortagesClient from "./RegionalShortagesClient";

export const metadata = {
  title: "Regional Commodity Shortages | A House Divided",
  description:
    "Every commodity where regional demand exceeds local supply, with the gap and price.",
};

export default function RegionalShortagesPage() {
  return <RegionalShortagesClient />;
}
