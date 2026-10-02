/**
 * Browser-side paid leg (bundled into public/cashu-paid-leg.bundle.js).
 *
 * The buyer page mints the ecash once the mint reports PAID; the facilitator
 * page redeems it. Both sides run the REAL cashu-ts wallet — no mocks, no
 * server round trip — so the money path shown in the demo is the money path.
 */
import { Mint, Wallet, getEncodedToken, sumProofs } from "@cashu/cashu-ts";

async function walletFor(mintUrl: string): Promise<Wallet> {
  const wallet = new Wallet(new Mint(mintUrl), { unit: "sat" });
  await wallet.loadMint();
  return wallet;
}

/**
 * cashu-ts v4 returns Amount objects, not numbers — a round trip through
 * JSON.stringify would hand the pages `{amount, unit}`. Coerce at this boundary so
 * everything the UI (and the e2e assertions) see is a plain integer.
 */
function sats(value: any): number {
  if (typeof value === "number") return value;
  if (value && typeof value.toNumber === "function") return value.toNumber();
  if (value && typeof value.amount === "number") return value.amount;
  return Number(value);
}

/** NUT-04 mint for an already-PAID quote; returns the token handed to the facilitator. */
export async function mintEcash(mintUrl: string, amount: number, quoteId: string) {
  const wallet = await walletFor(mintUrl);
  const proofs = await wallet.mintProofsBolt11(amount, quoteId);
  const token = getEncodedToken({ mint: mintUrl, proofs });
  return {
    token,
    total: sats(sumProofs(proofs)),
    proofCount: proofs.length,
    keyset: proofs[0]?.id,
  };
}

/** Facilitator side: redeem the token at the mint (this is what makes it SPENT for the buyer). */
export async function redeem(mintUrl: string, token: string) {
  const wallet = await walletFor(mintUrl);
  const received = await wallet.receive(token);
  return { total: sats(sumProofs(received)), proofCount: received.length };
}

/** NUT-07: prove the original proofs are now SPENT (i.e. the money actually moved). */
export async function checkStates(mintUrl: string, token: string) {
  const wallet = await walletFor(mintUrl);
  // v4: the module-level getDecodedToken() needs the wallet's keyset ids as a second
  // argument; wallet.decodeToken() is the version that already knows them.
  const decoded: any = wallet.decodeToken(token);
  const proofs = decoded?.proofs ?? decoded;
  const states = await wallet.checkProofsStates(proofs);
  return (states || []).map((s: any) => s?.state ?? s);
}

export function isTestMint(mintUrl: string) {
  return /testnut|localhost|127\.0\.0\.1/.test(mintUrl);
}
