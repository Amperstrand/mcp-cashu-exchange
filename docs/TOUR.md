# The grand tour: zero to a paid burger in one afternoon

One doc, in order. Each stage works alone; stop wherever you like.

## Stage 1 — call the live exchange (5 minutes, no install)

What is deployed and how to poke it, with verified curl calls:
[docs/LIVE.md](LIVE.md). Highlights: list MCP tools, search Berlin EV
chargers, ask the cinema chat for tonight's programme, see the federated
europark parking tools.

## Stage 2 — order real food with your own card (30 minutes)

The full participant E2E, from a free cashu.email inbox to a paid order at
Burgermeister Mehringdamm: [jamezz → docs/PARTICIPANT-GUIDE.md](https://github.com/Amperstrand/jamezz/blob/main/docs/PARTICIPANT-GUIDE.md).
You pay on the merchant's hosted Mollie page with your own card (personal
or [2fiat](https://2fiat.com)) — no card ever touches a repo, secret, or
tool ([docs/PAYMENT.md](PAYMENT.md)).

## Stage 3 — run the exchange yourself (10 minutes)

```sh
git clone git@github.com:Amperstrand/mcp-cashu-exchange.git && cd mcp-cashu-exchange
npm install && cp .dev.vars.example .dev.vars && npm run dev   # :8787
```

Full local loop in [docs/LIVE.md](LIVE.md) → "Handover".

## Stage 4 — extend it (an afternoon)

| You want to | Follow |
|---|---|
| Add a venue on Jamezz (photograph a table QR) | jamezz `prompts/onboard-table.md` |
| Add a venue on a new QR platform | jamezz `prompts/onboard-new-platform.md` |
| Find candidate venues in Berlin/Germany | jamezz `docs/CANDIDATES.md` |
| Write/extend the offline test suite | jamezz `prompts/write-tests.md` |
| Add a provider to the exchange | README → "Adding a component" |
| Federate your own MCP server | append to the `DOWNSTREAMS` secret |

The venue wiring exists: `jamezz.search` (MCP) and `/api/search?category=food`
(REST) both serve the registry's food provider — pick whichever transport you
like. Placing the order itself stays with the jamezz package and the
merchant's hosted checkout (the payment boundary).

## House rules on the way in

- Payment boundary = the merchant's hosted checkout URL. Your own card.
- No card numbers, cookies, HAR files, or captured payloads in commits —
  the pre-commit gate and CI enforce it in both repos.
- Commit through `sh scripts/git-commit.sh` in either repo.
