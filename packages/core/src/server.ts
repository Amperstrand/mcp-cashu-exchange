import type { CardCredentials, PaymentRail } from "@exchange/contracts";
import { railId } from "@exchange/contracts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CATALOG } from "./catalog.ts";
import type { DownstreamConfig } from "./gateway.ts";
import { listDownstreamTools } from "./gateway.ts";
import type { Registry } from "./registry.ts";

export interface ExchangeDeps {
  readonly registry: Registry;
  readonly rails: readonly PaymentRail[];
  readonly downstreams: readonly DownstreamConfig[];
  /** Present only when a card rail is configured; enables payment.card_details. */
  readonly card?: CardCredentials;
}

const geoPoint = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const searchNear = z.object({
  near: geoPoint.optional(),
  radiusKm: z.number().positive().max(100).optional(),
  text: z.string().max(200).optional(),
});

const money = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "decimal amount, e.g. 12.50"),
  currency: z.string().length(3),
});

function asText(value: unknown): { content: [{ type: "text"; text: string }] } {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

/** Composes the exchange's MCP surface from registry, rails, and gateway. */
export function buildMcpServer(deps: ExchangeDeps): McpServer {
  const server = new McpServer({
    name: "mcp-cashu-exchange",
    version: "0.0.1",
  });

  server.registerTool(
    "directory.list_services",
    {
      title: "List services",
      description:
        "List everything the exchange knows: static catalog entries, native providers, and payment rails.",
      inputSchema: {},
    },
    async () =>
      asText({
        catalog: CATALOG,
        providers: deps.registry.listProviders(),
        paymentRails: deps.rails.map((rail) => ({
          id: rail.id,
          kind: rail.kind,
          displayName: rail.displayName,
        })),
      }),
  );

  server.registerTool(
    "gateway.list_downstreams",
    {
      title: "List federated MCP servers",
      description:
        "List tools exposed by federated downstream MCP servers (private kits mounted via the gateway). Degrades per-downstream on failure.",
      inputSchema: {},
    },
    async () =>
      asText({
        downstreams: await Promise.all(
          deps.downstreams.map((downstream) => listDownstreamTools(downstream)),
        ),
      }),
  );

  for (const provider of deps.registry.listProviders()) {
    server.registerTool(
      `${provider.id}.search`,
      {
        title: `Search ${provider.displayName}`,
        description: `Search ${provider.category} services from ${provider.displayName}. Omit 'near' for the provider default area.`,
        inputSchema: searchNear.shape,
      },
      async (args) =>
        asText(
          await deps.registry.search({
            category: provider.category,
            ...(args.near === undefined ? {} : { near: args.near }),
            ...(args.radiusKm === undefined ? {} : { radiusKm: args.radiusKm }),
            ...(args.text === undefined ? {} : { text: args.text }),
          }),
        ),
    );
  }

  server.registerTool(
    "payment.quote",
    {
      title: "Quote a payment",
      description:
        "Get payment instructions for an amount. Optionally select one rail by id; otherwise quotes every configured rail.",
      inputSchema: {
        amount: money,
        rail: z.string().optional(),
      },
    },
    async (args) => {
      const wanted = args.rail;
      const selected =
        wanted === undefined
          ? deps.rails
          : deps.rails.filter((rail) => rail.id === railId(wanted));
      return asText(
        await Promise.all(selected.map((rail) => rail.quote(args.amount))),
      );
    },
  );

  const card = deps.card;
  if (card !== undefined) {
    server.registerTool(
      "payment.card_details",
      {
        title: "Get payment card credentials",
        description:
          "Full credentials of the configured prepaid card rail for agent-driven checkout. Only registered when the operator has set the card secrets.",
        inputSchema: {},
      },
      async () => asText(card),
    );
  }

  return server;
}
