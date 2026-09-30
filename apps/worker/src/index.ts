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
import { cinemaProvider, FILMS } from "@exchange/plugin-cinema";
import { twoFiatCardRail } from "@exchange/plugin-pay-2fiat";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { z } from "zod";
import { withKvCache } from "./cached-provider.ts";
import { settleOffer, ticketCode } from "./cashu-settle.ts";
import {
  ChatRequest,
  clearPendingOffer,
  handleChat,
  type PayReply,
  PayRequest,
  type PendingOffer,
  pendingOfferFor,
} from "./chat.ts";

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
    registry: createRegistry([charging, cinemaProvider()]),
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

/**
 * Demo cinema chat agent (hackathon). Keyword-regex intents over the
 * synthetic cinema catalog; Cashu ecash settlement for the offer.
 * Pending offers live in KV (multi-isolate safe); the in-memory map in
 * chat.ts stays as the same-isolate fast path. NOT part of the MCP surface.
 */
const PendingOfferStored = z.object({
  offer_id: z.string(),
  title: z.string(),
  amount_sats: z.number().int().positive(),
  memo: z.string(),
  filmTitle: z.string(),
  showtime: z.string(),
  qty: z.number().int().positive(),
});

type StoredOffer = z.infer<typeof PendingOfferStored>;

const OFFER_TTL_SECONDS = 900;

function offerKey(sessionId: string): string {
  return `chat:v1:offer:${sessionId}`;
}

async function persistOffer(
  cache: KVNamespace,
  session: string,
  offer: PendingOffer,
): Promise<void> {
  await cache.put(offerKey(session), JSON.stringify(offer), {
    expirationTtl: OFFER_TTL_SECONDS,
  });
}

/** Same-isolate memory first, then KV — pending offers survive isolate switches. */
async function resolveOffer(
  cache: KVNamespace,
  session: string,
  offerId: string,
): Promise<StoredOffer | undefined> {
  const remembered = pendingOfferFor(session, offerId);
  if (remembered !== undefined) return remembered;
  const raw = await cache.get(offerKey(session));
  if (raw === null) return undefined;
  const parsed = PendingOfferStored.safeParse(JSON.parse(raw));
  return parsed.success && parsed.data.offer_id === offerId
    ? parsed.data
    : undefined;
}

app.post("/api/chat", async (c) => {
  const parsed = ChatRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
  }
  const reply = handleChat(FILMS, parsed.data);
  if (reply.offer !== null) {
    const stored = pendingOfferFor(parsed.data.session, reply.offer.offer_id);
    if (stored !== undefined) {
      await persistOffer(c.env.CACHE, parsed.data.session, stored);
    }
  }
  return c.json(reply);
});

app.post("/api/chat/pay", async (c) => {
  const parsed = PayRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
  }
  const { session, offer_id, token } = parsed.data;
  const offer = await resolveOffer(c.env.CACHE, session, offer_id);
  if (offer === undefined) {
    return c.json({
      reply:
        "I don't have a pending offer with that id for this session. " +
        "Ask me what's playing and pick a film first.",
      tickets: [],
      error: "no pending offer",
    } satisfies PayReply);
  }
  const result = await settleOffer(offer, token);
  if (!result.ok) {
    return c.json({
      reply: `Payment failed — ${result.detail}. Nothing was booked; your offer is still open if you want to try another token.`,
      tickets: [],
      error: result.detail,
    } satisfies PayReply);
  }
  clearPendingOffer(session);
  await c.env.CACHE.delete(offerKey(session));
  const tickets = Array.from({ length: offer.qty }, () => ticketCode());
  return c.json({
    reply: `Booked! ${offer.qty} ticket${offer.qty === 1 ? "" : "s"} for ${offer.filmTitle} at ${offer.showtime} — redeemed ${result.redeemedSats} sat. Your ticket codes: ${tickets.join(", ")}. Enjoy the film!`,
    tickets,
  } satisfies PayReply);
});

export default app;
