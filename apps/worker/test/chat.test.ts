import { getEncodedToken } from "@cashu/cashu-ts";
import { beforeEach, describe, expect, it } from "vitest";
import { ACCEPTED_MINT, settleOffer, ticketCode } from "../src/cashu-settle.ts";
import { handleChat, pendingOfferFor, resetSessions } from "../src/chat.ts";

/** Synthetic film catalog — mirrors the plugin's shape, independent fixture. */
const FILMS = [
  { title: "Signal Lost", showtimes: ["19:30", "21:45"], priceSats: 12 },
  { title: "The Mint", showtimes: ["18:00", "20:15"], priceSats: 9 },
  { title: "Cash Only", showtimes: ["17:10", "22:00"], priceSats: 7 },
] as const;

const SESSION = "panel-demo";

function makeToken(mint: string, amounts: readonly number[]): string {
  return getEncodedToken({
    mint,
    unit: "sat",
    proofs: amounts.map((amount, i) => ({
      // valid hex so cashu-ts can handle the proof shape
      id: "00a1b2c3d4e5f607",
      amount,
      secret: `secret-${i}-${amount}`,
      C: "02".padEnd(66, "ab"),
    })),
  });
}

beforeEach(() => resetSessions());

describe("chat listing intent", () => {
  it("lists all films with showtimes and sat prices", () => {
    const res = handleChat(FILMS, {
      message: "what's playing?",
      session: SESSION,
    });
    expect(res.offer).toBeNull();
    for (const f of FILMS) {
      expect(res.reply).toContain(f.title);
      expect(res.reply).toContain(`${f.priceSats} sat`);
    }
  });

  it("treats a bare 'tickets?' as a listing", () => {
    const res = handleChat(FILMS, { message: "tickets?", session: SESSION });
    expect(res.offer).toBeNull();
    expect(res.reply).toContain("Signal Lost");
  });
});

describe("chat offer creation", () => {
  it("creates an offer for a film with default qty 2 and first showtime", () => {
    const res = handleChat(FILMS, { message: "Signal Lost", session: SESSION });
    expect(res.offer).not.toBeNull();
    expect(res.offer?.title).toBe("2× Signal Lost — 19:30");
    expect(res.offer?.amount_sats).toBe(24);
    expect(res.offer?.memo).toBe("Cinema tickets");
    expect(res.reply).toContain("24 sat");
  });

  it("honours an explicit showtime and quantity", () => {
    const res = handleChat(FILMS, {
      message: "3 tickets for The Mint at 20:15",
      session: SESSION,
    });
    expect(res.offer?.title).toBe("3× The Mint — 20:15");
    expect(res.offer?.amount_sats).toBe(27);
  });

  it("matches film names case-insensitively as a substring", () => {
    const res = handleChat(FILMS, {
      message: "two cash only please, 22:00",
      session: SESSION,
    });
    expect(res.offer?.title).toBe("2× Cash Only — 22:00");
    expect(res.offer?.amount_sats).toBe(14);
  });

  it("replaces the pending offer when a new film is requested", () => {
    const first = handleChat(FILMS, {
      message: "Signal Lost",
      session: SESSION,
    });
    const second = handleChat(FILMS, { message: "The Mint", session: SESSION });
    expect(first.offer?.offer_id).not.toBe(second.offer?.offer_id);
    const pending = pendingOfferFor(SESSION, second.offer?.offer_id ?? "");
    expect(pending?.filmTitle).toBe("The Mint");
    // the superseded offer no longer resolves
    expect(
      pendingOfferFor(SESSION, first.offer?.offer_id ?? ""),
    ).toBeUndefined();
  });
});

describe("chat capability blurb", () => {
  it("answers help with an honest capability description", () => {
    const res = handleChat(FILMS, { message: "help", session: SESSION });
    expect(res.offer).toBeNull();
    expect(res.reply).toContain("cinema tickets");
  });

  it("falls back to the blurb for unrelated messages", () => {
    const res = handleChat(FILMS, {
      message: "the weather is nice",
      session: SESSION,
    });
    expect(res.offer).toBeNull();
    expect(res.reply).toContain("cinema tickets");
  });
});

describe("cashu settlement", () => {
  const offer = {
    offer_id: "o1",
    title: "2× Signal Lost — 19:30",
    amount_sats: 24,
    memo: "Cinema tickets",
  };

  it("rejects a token from the wrong mint with an honest error", async () => {
    const token = makeToken("https://evil.mint.example", [32]);
    const result = await settleOffer(offer, token, async () => 32);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("wrong-mint");
      expect(result.detail).toContain(ACCEPTED_MINT);
      expect(result.detail).toContain("evil.mint.example");
    }
  });

  it("rejects an underpaid token before touching the network", async () => {
    const token = makeToken(ACCEPTED_MINT, [8, 4]); // 12 < 24
    let receiveCalled = false;
    const result = await settleOffer(offer, token, async () => {
      receiveCalled = true;
      return 12;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("underpaid");
    expect(receiveCalled).toBe(false);
  });

  it("rejects a garbage token as invalid without hitting the network", async () => {
    const result = await settleOffer(offer, "not-a-token", async () => 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-token");
  });

  it("settles a sufficient token via the injected receiver (mocked mint)", async () => {
    const token = makeToken(ACCEPTED_MINT, [16, 8]); // 24 == 24
    const result = await settleOffer(offer, token, async () => 24);
    expect(result).toEqual({ ok: true, redeemedSats: 24 });
  });

  it("turns a mint rejection (receiver throw) into an honest failure", async () => {
    const token = makeToken(ACCEPTED_MINT, [32]);
    const result = await settleOffer(offer, token, async () => {
      throw new Error("proof already spent");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("mint-rejected");
      expect(result.detail).toContain("proof already spent");
    }
  });

  it("flags a short redemption as underpaid even after the receive", async () => {
    const token = makeToken(ACCEPTED_MINT, [32]); // token claims 32
    const result = await settleOffer(offer, token, async () => 10); // mint only gave 10
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("underpaid");
  });
});

describe("ticket codes", () => {
  it("generates uppercase CINE-XXXX codes", () => {
    const code = ticketCode();
    expect(code).toMatch(/^CINE-[0-9A-F]{4}$/);
  });

  it("generates distinct codes", () => {
    const codes = new Set(Array.from({ length: 50 }, () => ticketCode()));
    expect(codes.size).toBeGreaterThan(40);
  });
});
