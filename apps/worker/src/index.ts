import type { CardCredentials } from "@exchange/contracts";
import {
  buildMcpServer,
  CATALOG,
  createRegistry,
  type DownstreamConfig,
  type ExchangeDeps,
} from "@exchange/core";
import {
  berlinChargingProvider,
  OverpassUnavailableError,
} from "@exchange/plugin-berlin-charging";
import { twoFiatCardRail } from "@exchange/plugin-pay-2fiat";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { z } from "zod";
import { withKvCache } from "./cached-provider.ts";

export interface Env {
  readonly CACHE: KVNamespace;
  readonly TWOFIAT_CARD_PAN?: string;
  readonly TWOFIAT_CARD_EXP?: string;
  readonly TWOFIAT_CARD_CVC?: string;
  readonly DOWNSTREAMS?: string;
}

const DownstreamsVar = z.array(
  z.object({
    name: z.string().min(1),
    url: z.string().url(),
    token: z.string().optional(),
  }),
);

const ChargingQuery = z.object({
  lat: z.coerce.number().min(-90).max(90).default(52.52),
  lng: z.coerce.number().min(-180).max(180).default(13.405),
  radiusKm: z.coerce.number().positive().max(50).default(5),
});

/** Boundary parse: a malformed DOWNSTREAMS var degrades to zero downstreams. */
function parseDownstreams(
  raw: string | undefined,
): readonly DownstreamConfig[] {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === "") return [];
  try {
    const parsed = DownstreamsVar.safeParse(JSON.parse(trimmed));
    return parsed.success ? parsed.data : [];
  } catch (error) {
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

function cardFromEnv(env: Env): CardCredentials | undefined {
  const {
    TWOFIAT_CARD_PAN: pan,
    TWOFIAT_CARD_EXP: exp,
    TWOFIAT_CARD_CVC: cvc,
  } = env;
  if (pan === undefined || exp === undefined || cvc === undefined) {
    return undefined;
  }
  return { pan, exp, cvc, note: "2fiat prepaid Mastercard — demo card rail" };
}

function exchangeDeps(env: Env): ExchangeDeps {
  const card = cardFromEnv(env);
  const charging = withKvCache(berlinChargingProvider(), env.CACHE, 600);
  return {
    registry: createRegistry([charging]),
    rails: card === undefined ? [] : [twoFiatCardRail(card)],
    downstreams: parseDownstreams(env.DOWNSTREAMS),
    ...(card === undefined ? {} : { card }),
  };
}

/**
 * Stateless MCP endpoint: one server + transport per POST.
 * GET/DELETE are rejected — no sessions, per the streamable-HTTP stateless pattern.
 */
async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }
  const server = buildMcpServer(exchangeDeps(env));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

const app = new Hono<{ Bindings: Env }>();

app.all("/mcp", (c) => handleMcp(c.req.raw, c.env));

app.get("/health", (c) =>
  c.json({ ok: true, service: "mcp.cashu-exchange", version: "0.0.1" }),
);

app.get("/api/services", (c) => {
  const deps = exchangeDeps(c.env);
  return c.json({
    catalog: CATALOG,
    providers: deps.registry.listProviders(),
    paymentRails: deps.rails.map((rail) => rail.id),
  });
});

app.get("/api/charging", async (c) => {
  const parsed = ChargingQuery.safeParse({
    lat: c.req.query("lat"),
    lng: c.req.query("lng"),
    radiusKm: c.req.query("radiusKm"),
  });
  if (!parsed.success) {
    return c.json({ error: "invalid query", issues: parsed.error.issues }, 400);
  }
  try {
    const records = await exchangeDeps(c.env).registry.search({
      category: "charging",
      near: { lat: parsed.data.lat, lng: parsed.data.lng },
      radiusKm: parsed.data.radiusKm,
    });
    return c.json({ count: records.length, records });
  } catch (error) {
    if (error instanceof OverpassUnavailableError) {
      return c.json({ error: error.message }, 502);
    }
    throw error;
  }
});

export default app;
