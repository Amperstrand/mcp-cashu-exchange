/**
 * Gate: a PaymentRail wrapper that refuses quote() unless a valid
 * trust-ring proof for the order is supplied.
 *
 * This is the OPT-IN integration point. The existing flow is untouched:
 * callers who don't wrap their rail get the old behaviour. Callers who
 * wrap get proof-gated quote().
 */

import type {
  Money,
  PaymentQuote,
  PaymentRail,
  PaymentResult,
} from "@exchange/contracts";
import type { TrustProof } from "./prove.ts";
import type { TrustSet, TrustSetPin } from "./trustset.ts";
import type { KeyImageSeenSet } from "./verify.ts";
import { createSeenSet, verifyProof } from "./verify.ts";

/**
 * Configuration for the trust-gated rail.
 */
export interface TrustGateConfig {
  /** The pinned trust set the client trusts (authority). */
  readonly pin: TrustSetPin;
  /** The full trust set the operator supplies with each quote. */
  readonly trustSet: TrustSet;
  /** Key-image seen-set (one-use enforcement). Create with createSeenSet(). */
  readonly seen: KeyImageSeenSet;
}

/**
 * The gated rail's quote() requires an extra argument: the trust proof.
 * We extend the PaymentRail interface with an overloaded quote.
 */
export interface TrustGatedRail extends Omit<PaymentRail, "quote"> {
  /**
   * Quote the order — but only if a valid trust-ring proof is supplied.
   * Throws if the proof is invalid (use verifyProof directly for a
   * {ok, reason} return).
   */
  quote(amount: Money, proof: TrustProof): Promise<PaymentQuote>;
}

/**
 * Wrap any PaymentRail so quote() refuses without a valid proof.
 *
 * pay() is passed through unchanged — the proof gates the quote, not the
 * payment itself. Once the client has a valid quote they may proceed.
 */
export function withTrustGate(
  rail: PaymentRail,
  config: TrustGateConfig,
): TrustGatedRail {
  return {
    id: rail.id,
    kind: rail.kind,
    displayName: `${rail.displayName} (trust-gated)`,
    quote: async (amount: Money, proof: TrustProof): Promise<PaymentQuote> => {
      const result = verifyProof(
        proof,
        config.trustSet,
        config.pin,
        config.seen,
      );
      if (!result.ok) {
        throw new Error(`trust-ring proof rejected: ${result.reason}`);
      }
      return rail.quote(amount);
    },
    pay: (quote: PaymentQuote): Promise<PaymentResult> => rail.pay(quote),
  };
}

export { createSeenSet };
