# plugin-trust-ring — Trust Ring Proof for Payment Rails

## What it is

An **opt-in** package that lets a card operator prove they belong to a trust set
the client already published — **without revealing which member they are** —
using LSAG (Linkable Spontaneous Anonymous Group) ring signatures over
secp256k1.

The proof binds the order context (order id, amount, currency, client id,
expiry, pinned set id) so it cannot be replayed for another order. The key
image enforces one-use per order/epoch without leaking cross-order linkability.

The verifier pins the trust set (event id + content hash) and requires the ring
to be an exact subset of that pinned set, with a minimum ring size of 4. This
defeats the "scraped key" attack where an attacker builds a ring from their own
key plus one trusted key.

**Dependencies:** `@noble/curves`, `@noble/hashes` (already in the monorepo's
lockfile as transitive deps of `@cashu/cashu-ts`). No new exotic deps.

## 3-step wiring into the existing demo

### 1. Import the wrapper

```ts
import { withTrustGate, createSeenSet, pinTrustSet } from "@exchange/plugin-trust-ring";
import { twoFiatCardRail } from "@exchange/plugin-pay-2fiat";
```

### 2. Publish / pin a trust set

The client publishes a trust set (e.g. as a Nostr event) and derives a pin
(setId + contentHash). The operator must supply the full set with each proof;
the verifier checks it matches the pin.

```ts
const trustSet = {
  setId: "evt-abc123…",
  description: "Berlin operators — vetted Q3 2026",
  members: [
    { publicKey: op0Pubkey, basis: "met-in-person", tier: "gold", expiresAt: "2027-12-31T23:59:59Z" },
    { publicKey: op1Pubkey, basis: "vouched",      tier: "silver" },
    // …
  ],
  publishedAt: "2026-10-01T00:00:00Z",
};
const pin = pinTrustSet(trustSet);
```

### 3. Call it before `payment.quote`

The 5-line wrapper — drop-in over any `PaymentRail`:

```ts
const seen = createSeenSet();
const gatedRail = withTrustGate(twoFiatCardRail(card), { pin, trustSet, seen });
// quote() now requires a valid TrustProof as the second argument:
const quote = await gatedRail.quote(amount, proof);
```

If the proof is invalid, `quote()` throws with the rejection reason. `pay()`
is passed through unchanged.

## Demo

```bash
# from the repo root:
npm test                                                # runs all tests including trust-ring
npm run demo --workspace @exchange/plugin-trust-ring    # prints the full two-role narrative

# or directly:
npx tsx packages/plugin-trust-ring/src/demo.ts
```

## 2-minute live demo script (~8 beats)

| Beat | What to say | What appears on screen |
|------|-------------|------------------------|
| **1. Setup** | "The client publishes a trust set of 8 vetted operators." | Trust set published: 8 members, content hash pinned. |
| **2. Operator proves** | "Operator #3 proves they're in the set — without revealing which one." | Ring of 4 chosen, key image computed, proof created. |
| **3. Client verifies** | "The client checks: is the ring a subset of my pinned set? Is the signature valid?" | ✅ ACCEPTED. Anonymity set = 4. |
| **4. Attack: non-member** | "An attacker outside the set tries to forge a proof." | ❌ REJECTED — invalid LSAG signature. *Proves: you can't sign without holding a ring member's secret key.* |
| **5. Attack: outside key** | "Attacker puts their own key in the ring alongside trusted keys." | ❌ REJECTED — ring not a subset of the pinned set. |
| **6. Attack: replay** | "A valid proof for order A is submitted for order B." | ❌ REJECTED — the message binds the order; sig for A ≠ B. |
| **7. Attack: double-use** | "The same proof is submitted twice for the same order." | ❌ REJECTED — key image already seen for this order/epoch. |
| **8. Summary** | "Membership proven, identity hidden, attacks defeated." | All 4 attacks ❌, honest proof ✅. Anonymity set = ring size. |

**One line on what the attack beat proves:** The non-member attack (beat 4)
proves the cryptographic core — an attacker who doesn't hold any ring member's
secret key cannot produce a valid LSAG signature, even if they know all the
public keys. The subset check (beat 5) is the policy layer that prevents
ring-forging with outside keys.

## Security decisions (already documented — do not change)

1. **Verifier pins the trust set** (event id + content hash) and requires the
   ring to be an exact subset. Minimum ring size ≥ 4.
2. **Signed message binds the order** (id, amount, currency, client id, expiry,
   pinned set id) — no replay across orders.
3. **Key image one-use, scoped per order/epoch** — not global (global would
   leak cross-order linkability).
4. **No ring padding with untrusted keys.** The anonymity set is the ring size;
   we surface it honestly. Members may carry basis / tier / expiry.
5. **Opt-in.** The wrapper is a function over `PaymentRail`; the existing flow
   is untouched. No edits to `packages/core` or `apps/worker`.

## Package layout

```
packages/plugin-trust-ring/
├── INTEGRATION.md          ← this file
├── package.json
├── src/
│   ├── index.ts            ← public exports
│   ├── lsag.ts             ← LSAG ring signature (Liu-Wong, secp256k1)
│   ├── trustset.ts         ← pinned trust set model + hash/pin helpers
│   ├── prove.ts            ← operator: produce proof (binds order)
│   ├── verify.ts           ← client: verify proof against policy
│   ├── gate.ts             ← PaymentRail wrapper (opt-in gate on quote)
│   └── demo.ts             ← runnable two-role narrative
└── test/
    └── trust-ring.test.ts  ← happy path + 4 negative cases + LSAG unit tests
```