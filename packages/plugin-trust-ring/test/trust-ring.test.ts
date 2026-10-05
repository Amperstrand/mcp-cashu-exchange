import { describe, expect, it } from "vitest";
import type { KeyPair } from "../src/lsag.ts";
import { generateKeyPair, verify as lsagVerify, sign } from "../src/lsag.ts";
import type { OrderContext, TrustProof } from "../src/prove.ts";
import { orderMessage, prove } from "../src/prove.ts";
import type { TrustMember, TrustSet, TrustSetPin } from "../src/trustset.ts";
import {
  matchesPin,
  pinTrustSet,
  trustSetContentHash,
} from "../src/trustset.ts";
import { createSeenSet, verifyProof } from "../src/verify.ts";

/** Safe array access — throws if undefined (runtime-checked, no `!`). */
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} out of bounds`);
  return v;
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
    setId: "test-set-001",
    description: "Test trust set",
    members,
    publishedAt: "2026-10-01T00:00:00Z",
  };
  return { set, keys, pin: pinTrustSet(set) };
}

function makeOrder(
  pin: TrustSetPin,
  overrides?: Partial<OrderContext>,
): OrderContext {
  return {
    orderId: "order-001",
    amount: "15.00",
    currency: "EUR",
    clientId: "client-alice",
    expiresAt: "2027-12-31T23:59:59Z",
    pin,
    ...overrides,
  };
}

/** Extract public keys from a range of key pairs. */
function pubKeys(keys: readonly KeyPair[], indices: number[]): Uint8Array[] {
  return indices.map((i) => at(keys, i).publicKey);
}

/** Extract secret keys from a range of key pairs. */
function secretKey(keys: readonly KeyPair[], i: number): Uint8Array {
  return at(keys, i).secretKey;
}

// ── LSAG unit tests (ported from the original test suite) ───────────

// The two suites below are CPU-bound (real secp256k1 scalar multiplication, no
// I/O). Idle they take 0.2-0.6s per test; on a loaded box (observed load 24-29
// on 4 cores) individual tests crossed vitest's 5s default and produced false
// reds. 30s is an explicit budget for a slow-but-progressing test, not a mask
// for a hang.
describe("LSAG sign/verify", { timeout: 30000 }, () => {
  it("verifies a valid signature (ring of 4)", () => {
    const keys = [
      generateKeyPair(),
      generateKeyPair(),
      generateKeyPair(),
      generateKeyPair(),
    ];
    const ring = keys.map((k) => k.publicKey);
    const msg = new TextEncoder().encode("test message");
    const sig = sign(msg, ring, 1, secretKey(keys, 1));
    expect(lsagVerify(msg, ring, sig)).toBe(true);
  });

  it("verifies regardless of signer position", () => {
    const keys = Array.from({ length: 4 }, () => generateKeyPair());
    const ring = keys.map((k) => k.publicKey);
    const msg = new TextEncoder().encode("test message");
    for (let i = 0; i < keys.length; i++) {
      const sig = sign(msg, ring, i, secretKey(keys, i));
      expect(lsagVerify(msg, ring, sig)).toBe(true);
    }
  });

  it("rejects a tampered message", () => {
    const keys = [
      generateKeyPair(),
      generateKeyPair(),
      generateKeyPair(),
      generateKeyPair(),
    ];
    const ring = keys.map((k) => k.publicKey);
    const sig = sign(
      new TextEncoder().encode("original"),
      ring,
      0,
      secretKey(keys, 0),
    );
    expect(lsagVerify(new TextEncoder().encode("tampered"), ring, sig)).toBe(
      false,
    );
  });

  it("rejects when wrong secret key is used", () => {
    const keys = [
      generateKeyPair(),
      generateKeyPair(),
      generateKeyPair(),
      generateKeyPair(),
    ];
    const ring = keys.map((k) => k.publicKey);
    const wrong = generateKeyPair();
    const sig = sign(
      new TextEncoder().encode("test"),
      ring,
      1,
      wrong.secretKey,
    );
    expect(lsagVerify(new TextEncoder().encode("test"), ring, sig)).toBe(false);
  });

  it("same signer produces same key image", () => {
    const keys = [
      generateKeyPair(),
      generateKeyPair(),
      generateKeyPair(),
      generateKeyPair(),
    ];
    const ring = keys.map((k) => k.publicKey);
    const msg = new TextEncoder().encode("test");
    const sig1 = sign(msg, ring, 1, secretKey(keys, 1));
    const sig2 = sign(msg, ring, 1, secretKey(keys, 1));
    expect(sig1.keyImage).toEqual(sig2.keyImage);
  });

  it("different signers produce different key images", () => {
    const keys = [
      generateKeyPair(),
      generateKeyPair(),
      generateKeyPair(),
      generateKeyPair(),
    ];
    const ring = keys.map((k) => k.publicKey);
    const msg = new TextEncoder().encode("test");
    const sig0 = sign(msg, ring, 0, secretKey(keys, 0));
    const sig1 = sign(msg, ring, 1, secretKey(keys, 1));
    expect(sig0.keyImage).not.toEqual(sig1.keyImage);
  });
});

// ── Trust set model tests ───────────────────────────────────────────

describe("trust set model", () => {
  it("content hash is deterministic for the same set", () => {
    const { set } = buildTrustSet(5);
    const h1 = trustSetContentHash(set);
    const h2 = trustSetContentHash(set);
    expect(h1).toBe(h2);
  });

  it("content hash changes when a member is added", () => {
    const a = buildTrustSet(5);
    const b = buildTrustSet(6);
    expect(a.pin.contentHash).not.toBe(b.pin.contentHash);
  });

  it("matchesPin returns true for the correct pin", () => {
    const { set, pin } = buildTrustSet(5);
    expect(matchesPin(set, pin)).toBe(true);
  });

  it("matchesPin returns false for a wrong pin", () => {
    const { set, pin } = buildTrustSet(5);
    const wrongPin: TrustSetPin = {
      setId: "wrong",
      contentHash: pin.contentHash,
    };
    expect(matchesPin(set, wrongPin)).toBe(false);
  });
});

// ── Trust ring: happy path + four negative cases ────────────────────

describe("trust ring prove/verify", { timeout: 30000 }, () => {
  it("HAPPY PATH: honest proof is accepted", () => {
    const N = 8;
    const { set, keys, pin } = buildTrustSet(N);
    const order = makeOrder(pin);
    const ringIndices = [0, 3, 5, 7]; // includes signer (3)
    const proof = prove(set, at(keys, 3), ringIndices, order);
    const result = verifyProof(proof, set, pin, createSeenSet());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.anonymitySetSize).toBe(4);
    }
  });

  it("NEGATIVE 1: non-member ring rejected (invalid LSAG signature)", () => {
    const N = 8;
    const { set, keys, pin } = buildTrustSet(N);
    const order = makeOrder(pin);
    const attacker = generateKeyPair(); // not in the trust set

    // Attacker builds a ring of trusted keys but signs with their own key.
    const ring = pubKeys(keys, [0, 1, 2, 3]);
    const sig = sign(orderMessage(order), ring, 0, attacker.secretKey);
    const badProof: TrustProof = {
      signature: sig,
      ring,
      pin,
      order,
      anonymitySetSize: ring.length,
    };
    const result = verifyProof(badProof, set, pin, createSeenSet());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("LSAG signature verification failed");
    }
  });

  it("NEGATIVE 2: ring with an outside key rejected (subset check)", () => {
    const N = 8;
    const { set, keys, pin } = buildTrustSet(N);
    const order = makeOrder(pin);
    const attacker = generateKeyPair();

    // Attacker includes their own key in the ring — signature is valid,
    // but the ring is not a subset of the pinned trust set.
    const ring = [attacker.publicKey, ...pubKeys(keys, [1, 2, 3])];
    const sig = sign(orderMessage(order), ring, 0, attacker.secretKey);
    const badProof: TrustProof = {
      signature: sig,
      ring,
      pin,
      order,
      anonymitySetSize: ring.length,
    };
    const result = verifyProof(badProof, set, pin, createSeenSet());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("outside the pinned trust set");
    }
  });

  it("NEGATIVE 3: proof for order A rejected for order B (replay)", () => {
    const N = 8;
    const { set, keys, pin } = buildTrustSet(N);
    const orderA = makeOrder(pin);
    const orderB = makeOrder(pin, {
      orderId: "order-999",
      amount: "99.00",
      clientId: "client-bob",
    });

    const ringIndices = [0, 3, 5, 7];
    const proof = prove(set, at(keys, 3), ringIndices, orderA);

    // Present the proof as if it were for order B.
    const replayProof: TrustProof = { ...proof, order: orderB };
    const result = verifyProof(replayProof, set, pin, createSeenSet());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("LSAG signature verification failed");
    }
  });

  it("NEGATIVE 4: reused key image rejected (one-use)", () => {
    const N = 8;
    const { set, keys, pin } = buildTrustSet(N);
    const order = makeOrder(pin);
    const ringIndices = [0, 3, 5, 7];
    const proof = prove(set, at(keys, 3), ringIndices, order);

    const seen = createSeenSet();
    const first = verifyProof(proof, set, pin, seen);
    expect(first.ok).toBe(true);

    const second = verifyProof(proof, set, pin, seen);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toContain("key image already used");
    }
  });

  it("ring smaller than MIN_RING_SIZE is rejected", () => {
    const N = 8;
    const { set, keys, pin } = buildTrustSet(N);
    const order = makeOrder(pin);
    // Ring of 3 — below MIN_RING_SIZE (4).
    expect(() => prove(set, at(keys, 3), [0, 3, 5], order)).not.toThrow();
    const proof = prove(set, at(keys, 3), [0, 3, 5], order);
    const result = verifyProof(proof, set, pin, createSeenSet());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("below minimum");
    }
  });

  it("trust set that doesn't match pin is rejected", () => {
    const N = 8;
    const { set, keys, pin } = buildTrustSet(N);
    const order = makeOrder(pin);
    const ringIndices = [0, 3, 5, 7];
    const proof = prove(set, at(keys, 3), ringIndices, order);

    // Build a different trust set but claim the same pin.
    const other = buildTrustSet(N);
    const result = verifyProof(proof, other.set, pin, createSeenSet());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The pin doesn't match the supplied trust set.
      expect(result.reason).toContain("does not match pin");
    }
  });

  it("expired order is rejected", () => {
    const N = 8;
    const { set, keys, pin } = buildTrustSet(N);
    const order = makeOrder(pin, { expiresAt: "2020-01-01T00:00:00Z" });
    const ringIndices = [0, 3, 5, 7];
    const proof = prove(set, at(keys, 3), ringIndices, order);
    const result = verifyProof(proof, set, pin, createSeenSet());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("expired");
    }
  });
});

describe("verifyProofForMessage (the gateway seam, exchange#12)", () => {
  it("accepts a proof signed over ANY canonical message — e.g. a DROPSHOP-style intent hash — and agrees with verifyProof on the classic path", async () => {
    const { orderMessage, prove } = await import("../src/prove.ts");
    const { verifyProofForMessage, verifyProof } = await import("../src/verify.ts");
    const keys = Array.from({ length: 4 }, () => generateKeyPair());
    const set = { setId: "upstream-test", description: "synthetic", publishedAt: "2026-10-05T00:00:00Z", members: keys.map(k => ({ publicKey: k.publicKey })) } as never;
    const pin = { setId: "upstream-test", contentHash: trustSetContentHash(set) };
    const order = { orderId: "x", amount: "1", currency: "EUR", clientId: "c", expiresAt: new Date(Date.now() + 3600_000).toISOString(), pin };

    // classic path: sign over orderMessage
    const classic = prove(set, keys[1]!, [0, 1, 2, 3], order);
    expect(verifyProof(classic, set, pin, createSeenSet()).ok).toBe(true);
    expect(verifyProofForMessage(orderMessage(order), classic, set, pin, createSeenSet()).ok).toBe(true);

    // gateway path: sign over an ARBITRARY canonical message (stand-in for orderIntentMessage)
    const { sign } = await import("../src/lsag.ts");
    const fakeIntentMessage = new Uint8Array(32).fill(7);
    const sig = sign(fakeIntentMessage, keys.map(k => k.publicKey), 1, keys[1]!.secretKey);
    const proof = { ...classic, signature: sig };
    expect(verifyProofForMessage(fakeIntentMessage, proof, set, pin, createSeenSet()).ok).toBe(true);
    // but the classic entry point rejects it (different message domain)
    expect(verifyProof(proof, set, pin, createSeenSet()).ok).toBe(false);
  });
});
