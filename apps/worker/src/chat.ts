import { z } from "zod";

/**
 * Demo cinema chat agent — keyword-regex intent router (no LLM).
 * One pending offer at a time per session; a new film request replaces it.
 * Session state is an in-memory Map: fine for single-instance `wrangler dev`,
 * resets on worker restart. Not suitable for multi-instance deploys.
 */

export interface Offer {
  readonly offer_id: string;
  readonly title: string;
  readonly amount_sats: number;
  readonly memo: string;
}

export interface ChatReply {
  readonly reply: string;
  readonly offer: Offer | null;
}

export interface PayReply {
  readonly reply: string;
  readonly tickets: readonly string[];
  readonly error?: string;
}

export interface PendingOffer extends Offer {
  readonly filmTitle: string;
  readonly showtime: string;
  readonly qty: number;
}

interface SessionState {
  pendingOffer?: PendingOffer;
}

const sessions = new Map<string, SessionState>();

const CAPABILITY_BLURB =
  "I book cinema tickets for today's synthetic screenings. " +
  "Ask me what's playing, then name a film (and optionally a time and quantity) — " +
  "I'll give you a Cashu payment offer. Pay it and I'll hand you ticket codes.";

const LISTING_INTENT = /ticket|movie|cinema|film|kino|what.*playing|showtime/i;
const HELP_INTENT = /help|buy|book|hi|hello/i;
const TIME_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const QTY_PATTERN = /\b(\d+)\s*(?:x|ticket|tickets|seat|seats)\b|\bx(\d+)\b/i;

export const ChatRequest = z.object({
  message: z.string().min(1).max(2000),
  session: z.string().min(1).max(200),
});

export const PayRequest = z.object({
  session: z.string().min(1).max(200),
  offer_id: z.string().min(1).max(200),
  token: z.string().min(1).max(16000),
});

/** Minimal film shape the chat layer needs from the catalog. */
export interface ChatFilm {
  readonly title: string;
  readonly showtimes: readonly string[];
  readonly priceSats: number;
  readonly cinema?: string;
}

function getSession(id: string): SessionState {
  let s = sessions.get(id);
  if (s === undefined) {
    s = {};
    sessions.set(id, s);
  }
  return s;
}

function listingReply(films: readonly ChatFilm[]): string {
  const lines = films.map((f) => {
    const where = f.cinema === undefined ? "" : ` @ ${f.cinema}`;
    return `• ${f.title}${where} — ${f.showtimes.join(", ")} · ${f.priceSats} sat/ticket`;
  });
  return `Tonight in Berlin:\n${lines.join("\n")}\n\nName a film (and how many tickets) and I'll make you a Cashu offer.`;
}

function matchFilm(
  films: readonly ChatFilm[],
  message: string,
): ChatFilm | undefined {
  const lower = message.toLowerCase();
  return films.find((f) => lower.includes(f.title.toLowerCase()));
}

function matchShowtime(film: ChatFilm, message: string): string | undefined {
  const m = TIME_PATTERN.exec(message);
  if (m === null) return undefined;
  const wanted = `${m[1]?.padStart(2, "0")}:${m[2]}`;
  return film.showtimes.find((t) => t === wanted);
}

function matchQty(message: string): number {
  const m = QTY_PATTERN.exec(message);
  if (m === null) return 2; // demo default: a pair of tickets
  const raw = m[1] ?? m[2];
  if (raw === undefined) return 2;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n <= 20 ? n : 2;
}

function randomId(): string {
  return crypto.randomUUID();
}

function offerFor(film: ChatFilm, showtime: string, qty: number): PendingOffer {
  return {
    offer_id: randomId(),
    title: `${qty}× ${film.title} — ${showtime}`,
    amount_sats: film.priceSats * qty,
    memo: "Cinema tickets",
    filmTitle: film.title,
    showtime,
    qty,
  };
}

/** Pure intent router — testable without the worker. */
export function handleChat(
  films: readonly ChatFilm[],
  body: z.infer<typeof ChatRequest>,
): ChatReply {
  const { message, session: sessionId } = body;
  const state = getSession(sessionId);

  if (LISTING_INTENT.test(message)) {
    // A film name in the same message means "book it", not just "list".
    const film = matchFilm(films, message);
    if (film === undefined) {
      return { reply: listingReply(films), offer: null };
    }
  }

  const film = matchFilm(films, message);
  if (film !== undefined) {
    const showtime = matchShowtime(film, message) ?? film.showtimes[0];
    if (showtime === undefined) {
      return {
        reply: `No showtimes for ${film.title} today.`,
        offer: null,
      };
    }
    const qty = matchQty(message);
    const offer = offerFor(film, showtime, qty);
    state.pendingOffer = offer;
    return {
      reply: `To confirm, pay ${offer.amount_sats} sat for “${offer.title}”. I'll hold this offer while you pay.`,
      offer: {
        offer_id: offer.offer_id,
        title: offer.title,
        amount_sats: offer.amount_sats,
        memo: offer.memo,
      },
    };
  }

  if (HELP_INTENT.test(message)) {
    return { reply: CAPABILITY_BLURB, offer: null };
  }

  return { reply: CAPABILITY_BLURB, offer: null };
}

/** Look up the pending offer for a pay attempt; honest error if absent/mismatched. */
export function pendingOfferFor(
  sessionId: string,
  offerId: string,
): PendingOffer | undefined {
  const pending = sessions.get(sessionId)?.pendingOffer;
  return pending !== undefined && pending.offer_id === offerId
    ? pending
    : undefined;
}

/** Mark the pending offer consumed after a successful settlement. */
export function clearPendingOffer(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (s !== undefined) s.pendingOffer = undefined;
}

/** Test helper: wipe all session state between tests. */
export function resetSessions(): void {
  sessions.clear();
}
