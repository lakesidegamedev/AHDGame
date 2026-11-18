import RegionalShortagesClient from "./RegionalShortagesClient";

export const metadata = {
  title: "Regional Commodity Markets | A House Divided",
  description: "Compare commodity demand, supply and prices across national and regional markets.",
};

export default async function RegionalShortagesPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string | string[]; view?: string | string[] }>;
}) {
  const { country, view } = await searchParams;
  const initialCountry = typeof country === "string" ? country.toUpperCase() : undefined;
  return (
    <RegionalShortagesClient
      key={JSON.stringify([initialCountry, view])}
      initialCountry={initialCountry}
      initialShowAll={view === "all"}
    />
  );
}
