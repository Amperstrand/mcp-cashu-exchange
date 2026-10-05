/**
 * @exchange/plugin-trust-ring — opt-in trust-ring proof for payment rails.
 *
 * Lets an operator prove they belong to a trust set the client already
 * published, WITHOUT revealing which member they are, using LSAG ring
 * signatures over secp256k1. The proof binds the order context so it
 * cannot be replayed, and the key image enforces one-use per order/epoch.
 */

export type { TrustGateConfig, TrustGatedRail } from "./gate.ts";
// Gate
export { withTrustGate } from "./gate.ts";
export type { KeyPair, LSAGSignature } from "./lsag.ts";
// LSAG crypto
export { generateKeyPair, hashToCurve, sign, verify } from "./lsag.ts";
export type { OrderContext, TrustProof } from "./prove.ts";
// Prove
export { orderMessage, prove } from "./prove.ts";
export type {
  TrustBasis,
  TrustMember,
  TrustSet,
  TrustSetPin,
  TrustTier,
} from "./trustset.ts";
// Trust set model
export {
  matchesPin,
  pinTrustSet,
  toHex,
  trustSetContentHash,
} from "./trustset.ts";
export type { KeyImageSeenSet, VerifyResult } from "./verify.ts";
// Verify
export { createSeenSet, MIN_RING_SIZE, verifyProof } from "./verify.ts";
