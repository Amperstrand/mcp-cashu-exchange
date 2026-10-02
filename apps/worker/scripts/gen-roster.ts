#!/usr/bin/env node
/**
 * gen-roster.ts — regenerate the demo facilitator roster.
 *
 * The roster plays the part of "the pizzeria's published facilitator keys":
 * in production these are npubs read off Nostr / the marketplace listing.
 *
 * KEY DERIVATION — why it works this way:
 * The demo must be self-contained (the facilitator page signs without a wallet),
 * but committing private keys to a public repo is wrong even when they are
 * throwaway. So the keys are DERIVED from a public constant:
 *
 *     secretKey = sha256("mcp-cashu-pizza-demo/" + idx)          (32 bytes)
 *     publicKey = secp256k1.getPublicKey(secretKey, true)       (33 bytes)
 *
 * Only public keys land in the fixture. Both pages recompute the identical
 * secret locally, so nothing secret is ever committed and the fixture stays
 * reproducible. These keys are still throwaway by construction — the seed is
 * public, so anyone can derive them. Never use them for anything real.
 *
 * Uses the REAL key derivation the package uses (secp256k1.getPublicKey with
 * compressed output), so the keys behave exactly like live ones.
 *
 * Usage:  npx tsx apps/worker/scripts/gen-roster.ts
 * Output: apps/worker/public/facilitator-roster.json
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "..", "public", "facilitator-roster.json");

export const DERIVATION_PREFIX = "mcp-cashu-pizza-demo/";

const ROSTER = [
  { label: "Food Runners Berlin", basis: "met-in-person", tier: "gold", deliveries: 312, rating: 4.9 },
  { label: "Kreuzberg Couriers", basis: "vouched", tier: "silver", deliveries: 88, rating: 4.7 },
  { label: "Mitte Bike Messengers", basis: "met-in-person", tier: "gold", deliveries: 205, rating: 4.8 },
  { label: "Sole Delivery Co-op", basis: "vouched", tier: "silver", deliveries: 141, rating: 4.6 },
  { label: "Neukölln Night Riders", basis: "vouched", tier: "silver", deliveries: 67, rating: 4.5 },
  { label: "Prenzlauer Pedal", basis: "seed", tier: "bronze", deliveries: 12, rating: 4.4 },
  { label: "Tempelhof Transit", basis: "seed", tier: "bronze", deliveries: 5, rating: 4.3 },
  { label: "Charlottenburg Couriers", basis: "seed", tier: "bronze", deliveries: 3, rating: 4.2 },
];

export function deriveDemoKeys(idx: number) {
  const secretKey = sha256(new TextEncoder().encode(DERIVATION_PREFIX + idx));
  const publicKey = secp256k1.getPublicKey(secretKey, true);
  return { secretKey, publicKey };
}

const members = ROSTER.map((r, i) => {
  const { publicKey } = deriveDemoKeys(i);
  return {
    idx: i,
    label: r.label,
    pubkey: Array.from(publicKey, (b) => b.toString(16).padStart(2, "0")).join(""),
    basis: r.basis,
    tier: r.tier,
    deliveries: r.deliveries,
    rating: r.rating,
    status: "demo-key",
  };
});

const doc = {
  _warning:
    "Demo fixture. Facilitator keys are DERIVED from the public constant in keyDerivation below — no private key is stored here and none should ever be. Throwaway by construction; never use for anything real.",
  keyDerivation: 'secretKey = sha256("mcp-cashu-pizza-demo/" + idx); publicKey = secp256k1.getPublicKey(secretKey, true)',
  setId: "pizza-facilitators-berlin",
  description: "Berlin pizza facilitators — vetted Q3 2026 (demo roster)",
  publishedAt: "2026-09-28T11:20:00Z",
  members,
};

writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
console.log(`wrote ${out}`);
console.log(`${members.length} members — pubkeys only, no secrets`);
console.log(`verify idx0: ${members[0].pubkey.slice(0, 24)}…`);
