/**
 * Demo: a runnable two-role narrative.
 *
 * Operator proves → Client verifies → NON-MEMBER attack rejected →
 * Outside-key ring rejected → Replay (wrong order) rejected →
 * Reused key image rejected → Success.
 *
 * Run:  npm run demo --workspace @exchange/plugin-trust-ring
 *       npx tsx src/demo.ts
 */

import type { KeyPair } from "./lsag.ts";
import { generateKeyPair, sign } from "./lsag.ts";
import type { OrderContext, TrustProof } from "./prove.ts";
import { orderMessage, prove } from "./prove.ts";
import type { TrustMember, TrustSet, TrustSetPin } from "./trustset.ts";
import { pinTrustSet, toHex } from "./trustset.ts";
import { createSeenSet, MIN_RING_SIZE, verifyProof } from "./verify.ts";

function header(title: string): string {
  return `\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`;
}

function log(label: string, value: string): string {
  return `  ${label.padEnd(28)} ${value}`;
}

/** Build a trust set of N members. */
function buildTrustSet(n: number): {
  set: TrustSet;
  keys: KeyPair[];
  pin: TrustSetPin;
} {
  const keys: KeyPair[] = [];
  const members: TrustMember[] = [];
  for (let i = 0; i < n; i++) {
    const kp = generateKeyPair();
    keys.push(kp);
    members.push({
      publicKey: kp.publicKey,
      label: `operator-${i}`,
      basis: i < 2 ? "met-in-person" : i < 5 ? "vouched" : "seed",
      tier: i < 2 ? "gold" : i < 5 ? "silver" : "bronze",
      expiresAt: "2027-12-31T23:59:59Z",
    });
  }
  const set: TrustSet = {
    setId: "trust-set-demo-001",
    description: "Demo trust set for live presentation",
    members,
    publishedAt: "2026-10-01T00:00:00Z",
  };
  return { set, keys, pin: pinTrustSet(set) };
}

async function main(): Promise<void> {
  const lines: string[] = [];

  lines.push(header("TRUST RING DEMO — mcp-cashu-exchange"));
  lines.push("");
  lines.push("  Scenario: A client wants to pay for a food delivery via the");
  lines.push("  2fiat-card rail. The card operator must prove they belong to");
  lines.push("  a trust set the client already published — without revealing");
  lines.push("  which member they are.");

  // ── Setup ──────────────────────────────────────────────────────────
  const N = 8;
  const { set, keys, pin } = buildTrustSet(N);
  lines.push("");
  lines.push(header(`SETUP — Trust set published (${N} members)`));
  lines.push(log("Set ID", set.setId));
  lines.push(log("Content hash (pin)", `${pin.contentHash.slice(0, 16)}…`));
  lines.push(log("Members", `${N} (met-in-person / vouched / seed)`));
  lines.push(log("Min ring size", `${MIN_RING_SIZE}`));

  // ── Role 1: Operator proves ────────────────────────────────────────
  const operatorIdx = 3;
  const operatorKey = keys[operatorIdx] ?? keys[0];
  if (!operatorKey) throw new Error("no keys generated");
  lines.push("");
  lines.push(header("ROLE 1 — OPERATOR: produce trust proof"));
  lines.push(
    log("Operator (member)", `operator-${operatorIdx} (vouched, silver)`),
  );
  lines.push(
    log("Operator pubkey", `${toHex(operatorKey.publicKey).slice(0, 16)}…`),
  );

  const ringIndices = [0, 3, 5, 7]; // includes signer
  const orderA: OrderContext = {
    orderId: "order-2026-001",
    amount: "15.00",
    currency: "EUR",
    clientId: "client-alice",
    expiresAt: "2027-12-31T23:59:59Z",
    pin,
  };

  const proof = prove(set, operatorKey, ringIndices, orderA);
  lines.push(
    log("Ring chosen", `${ringIndices.length} members from trust set`),
  );
  lines.push(log("Anonymity set", `${proof.anonymitySetSize} (the ring size)`));
  lines.push(
    log(
      "Order bound",
      `${orderA.orderId} / ${orderA.amount} ${orderA.currency}`,
    ),
  );
  lines.push(
    log("Key image", `${toHex(proof.signature.keyImage).slice(0, 16)}…`),
  );
  lines.push("");
  lines.push("  → Proof created. Operator sends it to the client.");

  // ── Role 2: Client verifies ────────────────────────────────────────
  const seen = createSeenSet();
  lines.push("");
  lines.push(header("ROLE 2 — CLIENT: verify trust proof"));
  const result = verifyProof(proof, set, pin, seen);
  lines.push(log("Result", result.ok ? "✅ ACCEPTED" : "❌ REJECTED"));
  if (result.ok) {
    lines.push(log("Anonymity set size", `${result.anonymitySetSize}`));
    lines.push("");
    lines.push("  → Client proceeds to quote() on the trust-gated rail.");
  }

  // ── ATTACK 1: Non-member ───────────────────────────────────────────
  lines.push("");
  lines.push(header("ATTACK 1 — NON-MEMBER tries to prove"));
  const attacker = generateKeyPair();
  lines.push(
    log("Attacker pubkey", `${toHex(attacker.publicKey).slice(0, 16)}…`),
  );
  lines.push("  The attacker is NOT in the trust set. They build a ring of 4");
  lines.push("  trusted keys and sign, but their secret key matches none.");

  const attackerRing = [keys[0], keys[1], keys[2], keys[3]]
    .filter((k): k is KeyPair => k !== undefined)
    .map((k) => k.publicKey);
  const attackerSig = sign(
    orderMessage(orderA),
    attackerRing,
    0,
    attacker.secretKey,
  );
  const attackerProof: TrustProof = {
    signature: attackerSig,
    ring: attackerRing,
    pin,
    order: orderA,
    anonymitySetSize: attackerRing.length,
  };
  const attackResult1 = verifyProof(attackerProof, set, pin, createSeenSet());
  lines.push(log("Result", attackResult1.ok ? "✅ ACCEPTED" : "❌ REJECTED"));
  if (!attackResult1.ok) lines.push(log("Reason", attackResult1.reason));
  lines.push("");
  lines.push(
    "  → Defeated: invalid LSAG signature — attacker's key isn't in the ring.",
  );

  // ── ATTACK 2: Outside key in ring ──────────────────────────────────
  lines.push("");
  lines.push(header("ATTACK 2 — RING WITH OUTSIDE KEY"));
  lines.push("  Attacker builds a ring with their OWN key + 3 trusted keys.");
  lines.push(
    "  The signature is valid, but the subset check catches the outside key.",
  );

  const outsideRing = [
    attacker.publicKey,
    ...[keys[1], keys[2], keys[3]]
      .filter((k): k is KeyPair => k !== undefined)
      .map((k) => k.publicKey),
  ];
  const outsideSig = sign(
    orderMessage(orderA),
    outsideRing,
    0,
    attacker.secretKey,
  );
  const outsideProof: TrustProof = {
    signature: outsideSig,
    ring: outsideRing,
    pin,
    order: orderA,
    anonymitySetSize: outsideRing.length,
  };
  const attackResult2 = verifyProof(outsideProof, set, pin, createSeenSet());
  lines.push(log("Result", attackResult2.ok ? "✅ ACCEPTED" : "❌ REJECTED"));
  if (!attackResult2.ok) lines.push(log("Reason", attackResult2.reason));
  lines.push("");
  lines.push("  → Defeated: ring is not a subset of the pinned trust set.");

  // ── ATTACK 3: Replay for different order ───────────────────────────
  lines.push("");
  lines.push(header("ATTACK 3 — REPLAY proof for a DIFFERENT ORDER"));
  lines.push("  A valid proof for order A is submitted for order B.");

  const orderB: OrderContext = {
    orderId: "order-2026-999",
    amount: "99.00",
    currency: "EUR",
    clientId: "client-bob",
    expiresAt: "2027-12-31T23:59:59Z",
    pin,
  };
  const replayProof: TrustProof = { ...proof, order: orderB };
  const attackResult3 = verifyProof(replayProof, set, pin, createSeenSet());
  lines.push(log("Result", attackResult3.ok ? "✅ ACCEPTED" : "❌ REJECTED"));
  if (!attackResult3.ok) lines.push(log("Reason", attackResult3.reason));
  lines.push("");
  lines.push(
    "  → Defeated: the signed message binds the order; sig for A ≠ B.",
  );

  // ── ATTACK 4: Reused key image ─────────────────────────────────────
  lines.push("");
  lines.push(header("ATTACK 4 — REUSED KEY IMAGE (double-spend)"));
  lines.push(
    "  The same operator submits the same proof twice for the same order.",
  );

  const seen5 = createSeenSet();
  const firstResult = verifyProof(proof, set, pin, seen5);
  lines.push(
    log("First submission", firstResult.ok ? "✅ ACCEPTED" : "❌ REJECTED"),
  );
  const secondResult = verifyProof(proof, set, pin, seen5);
  lines.push(
    log("Second submission", secondResult.ok ? "✅ ACCEPTED" : "❌ REJECTED"),
  );
  if (!secondResult.ok) lines.push(log("Reason", secondResult.reason));
  lines.push("");
  lines.push(
    "  → Defeated: key image scoped per order/epoch — one-use enforced",
  );
  lines.push("    without leaking cross-order linkability.");

  // ── Summary ────────────────────────────────────────────────────────
  lines.push("");
  lines.push(header("SUMMARY"));
  lines.push("  ✅ Honest proof accepted");
  lines.push("  ❌ Non-member attack rejected (invalid LSAG signature)");
  lines.push("  ❌ Outside-key ring rejected (subset check on pinned set)");
  lines.push("  ❌ Order replay rejected (message binds order context)");
  lines.push("  ❌ Key image reuse rejected (one-use, per-epoch scope)");
  lines.push("");
  lines.push("  The operator proved membership WITHOUT revealing which of the");
  lines.push(
    `  ${proof.anonymitySetSize} ring members they are. Anonymity set = ring size.`,
  );
  lines.push("");
  lines.push("  → Wire into the 2fiat-card rail: see INTEGRATION.md");
  lines.push("");

  console.log(lines.join("\n"));
}

await main();
