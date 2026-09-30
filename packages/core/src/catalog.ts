/**
 * Static catalog entries: services the exchange knows about but does not
 * search natively (federated kits, settlement backends, sibling frontends).
 * Kept as pure data — add entries here, no code changes.
 */
export const CATALOG = [
  {
    id: "pecan",
    role: "settlement",
    name: "Pecan — alternative-numeraire settlement",
    url: "https://github.com/zeugmaster/pecan",
    note: "CDK mint payment processor + teller console for custom units (kWh, vouchers, local currencies). Wire via plugin-pay-cashu.",
  },
  {
    id: "evmap",
    role: "frontend",
    name: "evmap.cashu.exchange",
    url: "https://evmap.cashu.exchange",
    note: "Provider-agnostic EV charge map with Cashu pay-and-start (private repo, Norway providers).",
  },
  {
    id: "silent-energy",
    role: "frontend",
    name: "energy.cashu.exchange",
    url: "https://energy.cashu.exchange",
    note: "Cashu pay-per-trigger IoT payment frontend for hermes-managed devices (private repo).",
  },
  {
    id: "cashu-exchange",
    role: "wallet",
    name: "cashu.exchange",
    url: "https://cashu.exchange",
    note: "Testnut Cashu exchange on Cloudflare Workers — demo funds source for the ecash → Lightning → 2fiat card loop.",
  },
] as const;

export type CatalogEntry = (typeof CATALOG)[number];
