import { getTokenMetadata, Mint, Wallet } from "@cashu/cashu-ts";
import type { Offer } from "./chat.ts";

/**
 * Cashu settlement for the demo cinema chat agent.
 * Honest settlement only: never claim success unless the mint actually redeemed.
 */

/** The only mint this demo wallet accepts (signet zoo mint we own). */
export const ACCEPTED_MINT = "https://cdk-a056e0f.cashu.exchange";

export type SettleFailure =
  | "invalid-token"
  | "wrong-mint"
  | "underpaid"
  | "no-offer"
  | "mint-rejected";

export type SettleResult =
  | { readonly ok: true; readonly redeemedSats: number }
  | {
      readonly ok: false;
      readonly reason: SettleFailure;
      readonly detail: string;
    };

/**
 * Injectable seam for the mint network call (follows the repo's `fetchImpl`
 * convention). Production default receives via cashu-ts; tests inject a fake.
 * Returns the redeemed amount in sats, or throws on mint rejection.
 */
export type ReceiveFn = (token: string) => Promise<number>;

/** Production receiver: redeem the token at the accepted mint, unit sat. */
export const receiveViaMint: ReceiveFn = async (token) => {
  const wallet = new Wallet(new Mint(ACCEPTED_MINT), { unit: "sat" });
  await wallet.loadMint();
  const proofs = await wallet.receive(token);
  return proofs.reduce((sum, p) => sum + p.amount.toNumber(), 0);
};

/**
 * Decode a token and validate it against the offer WITHOUT hitting the network.
 * Returns the token's mint + amount, or a failure reason.
 */
export function inspectToken(
  token: string,
  offer: Offer,
):
  | { readonly mint: string; readonly amountSats: number }
  | { readonly error: SettleFailure; readonly detail: string } {
  let meta: ReturnType<typeof getTokenMetadata>;
  try {
    meta = getTokenMetadata(token);
  } catch {
    return {
      error: "invalid-token",
      detail: "that doesn't look like a Cashu token at all",
    };
  }
  if (meta.mint !== ACCEPTED_MINT) {
    return {
      error: "wrong-mint",
      detail: `this demo wallet only accepts the signet zoo mint (${ACCEPTED_MINT}); that token is from ${meta.mint}`,
    };
  }
  const amountSats = meta.amount.toNumber();
  if (amountSats < offer.amount_sats) {
    return {
      error: "underpaid",
      detail: `underpaid: this offer needs ${offer.amount_sats} sat but the token only carries ${amountSats} sat`,
    };
  }
  return { mint: meta.mint, amountSats };
}

/**
 * Settle an offer with a Cashu token. Pure orchestration: decode + validate
 * locally, then delegate the actual redemption to `receive`. Never fakes a
 * success — a throw or short receive is an honest failure.
 */
export async function settleOffer(
  offer: Offer,
  token: string,
  receive: ReceiveFn = receiveViaMint,
): Promise<SettleResult> {
  const inspected = inspectToken(token, offer);
  if ("error" in inspected) {
    return { ok: false, reason: inspected.error, detail: inspected.detail };
  }
  let redeemed: number;
  try {
    redeemed = await receive(token);
  } catch (error) {
    return {
      ok: false,
      reason: "mint-rejected",
      detail:
        error instanceof Error
          ? `the mint refused to redeem the token: ${error.message}`
          : "the mint refused to redeem the token",
    };
  }
  if (redeemed < offer.amount_sats) {
    return {
      ok: false,
      reason: "underpaid",
      detail: `the mint only redeemed ${redeemed} sat, short of the ${offer.amount_sats} sat needed`,
    };
  }
  return { ok: true, redeemedSats: redeemed };
}

/** Generate a demo ticket code like "CINE-7F3A" (random hex, uppercase). */
export function ticketCode(): string {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `CINE-${hex}`;
}
