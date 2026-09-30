# @exchange/chat

Chat frontend for **mcp.cashu.exchange**.

## Today (zero build cost)

Any MCP client works against the deployed endpoint:

```
https://mcp.cashu.exchange/mcp
```

- Claude Desktop / Claude Code: add as a remote MCP server (streamable HTTP).
- opencode / other CLI agents: point them at the URL above.

Ask things like:

> "Find me EV chargers within 3 km of Kreuzberg" (berlin-charging.search)
> "What services does the exchange know about?" (directory.list_services)
> "Quote paying 24.50 EUR" (payment.quote)

## Graduate into a web chat here when ready

1. Vite + Preact (the silent.energy pattern).
2. One server-side proxy route that holds the LLM key; the browser never sees it.
3. Wire tools by calling `/mcp` server-side (the worker is the MCP client here),
   or inline the same registry/rails via `@exchange/core` — both stay in sync
   because they share `@exchange/contracts`.
4. Human-gate anything that spends money: card checkout, 3DS prompts,
   Cashu melts. The chat proposes; the human confirms.
