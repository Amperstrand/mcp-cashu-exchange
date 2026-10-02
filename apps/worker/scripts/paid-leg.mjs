#!/usr/bin/env node
/**
 * PAID LEG, live, in cashu-ts — the money path in isolation.
 *
 *   1. ask the mint for a NUT-04 quote,
 *   2. wait for it to be PAID,
 *   3. MINT the ecash (proofs),
 *   4. encode the token the buyer hands to the facilitator (NUT-00 v4 "cashuB"),
 *   5. facilitator REDEEMS it (receive/swap) and the original proofs go SPENT.
 *
 * Default mint is https://testnut.cashu.space, which auto-pays its own quotes —
 * that is what makes this demonstrable without funds. Point MINT_URL at the
 * signet mint (https://cdk-a056e0f.cashu.exchange) and the same code waits for a
 * real signet payment instead; it then reports the timeout honestly rather than
 * pretending.
 *
 *   node apps/worker/scripts/paid-leg.mjs [amount] [mintUrl]
 */
import { Mint, Wallet, getEncodedToken, sumProofs } from "@cashu/cashu-ts";

const AMOUNT = Number(process.argv[2] || 21);
const MINT_URL = process.argv[3] || process.env.MINT_URL || "https://testnut.cashu.space";
const LABELLED_TEST_MINT = MINT_URL.includes("testnut") || MINT_URL.includes("localhost");

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForPaid(wallet, quote, { tries = 20, everyMs = 1500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const fresh = await wallet.checkMintQuoteBolt11(quote.quote);
    if (fresh.state === "PAID" || fresh.state === "ISSUED") return fresh;
    if (i === 0) log(`   state=${fresh.state} (waiting)`);
    await sleep(everyMs);
  }
  return await wallet.checkMintQuoteBolt11(quote.quote);
}

async function main() {
  log(`\n=== cashu-ts paid leg | mint=${MINT_URL}${LABELLED_TEST_MINT ? "  [TEST MINT — auto-pays]" : ""}`);
  const buyer = new Wallet(new Mint(MINT_URL), { unit: "sat" });
  await buyer.loadMint();
  log(`   mint loaded: ${buyer.mint.mintUrl}`);

  // 1 — NUT-04 quote (cashu-ts v4 takes the method first; the Bolt11 helpers are explicit)
  const quote = await buyer.createMintQuoteBolt11(AMOUNT);
  log(`1. quote ${quote.quote} for ${AMOUNT} sat, state=${quote.state}`);
  log(`   invoice ${String(quote.request).slice(0, 32)}…`);

  // 2 — wait for payment
  const paid = await waitForPaid(buyer, quote);
  if (paid.state !== "PAID" && paid.state !== "ISSUED") {
    log(`!! quote never reached PAID (state=${paid.state}).`);
    log("   On the signet mint this means the signet invoice was not paid — that is a funding gap, not a code failure.");
    process.exit(2);
  }
  log(`2. quote PAID`);

  // 3 — mint the ecash
  const proofs = await buyer.mintProofsBolt11(AMOUNT, quote.quote);
  log(`3. minted ${proofs.length} proof(s), total ${sumProofs(proofs)} sat, keyset ${proofs[0]?.id}`);

  // 4 — encode the token the buyer hands over
  const token = getEncodedToken({ mint: MINT_URL, proofs });
  log(`4. token encoded (${token.length} chars): ${token.slice(0, 40)}…`);

  // 5 — facilitator redeems
  const facilitator = new Wallet(new Mint(MINT_URL), { unit: "sat" });
  await facilitator.loadMint();
  if (typeof facilitator.receive !== "function") {
    log("!! facilitator wallet has no receive(); cannot demonstrate redemption");
    process.exit(3);
  }
  const received = await facilitator.receive(token);
  log(`5. facilitator redeemed -> ${received.length} proof(s), total ${sumProofs(received)} sat`);

  const states = await facilitator.checkProofsStates(proofs);
  const spent = states.filter((s) => s.state === "SPENT").length;
  log(`   original proofs now: ${states.map((s) => s.state).join(",")} (${spent}/${states.length} SPENT)`);

  log("\nPAID LEG OK: quote -> paid -> minted -> token handed over -> redeemed");
  return 0;
}

main().then((rc) => process.exit(rc)).catch((e) => {
  console.error("PAID LEG FAILED:", e?.message || e);
  process.exit(1);
});
