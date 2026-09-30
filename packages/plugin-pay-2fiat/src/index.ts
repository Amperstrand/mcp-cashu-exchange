import type {
  CardCredentials,
  PaymentQuote,
  PaymentRail,
  PaymentResult,
} from "@exchange/contracts";
import { railId } from "@exchange/contracts";

const RAIL_ID = railId("2fiat-card");

/**
 * The "card" payment rail: a 2fiat prepaid Mastercard funded from crypto.
 * The actual charge happens at the merchant checkout (agent fills the card
 * details, human gates 3DS) — quote() produces the instructions and pay()
 * returns an honest "pending" reference, not a fake settlement.
 */
export function twoFiatCardRail(card: CardCredentials): PaymentRail {
  const last4 = card.pan.slice(-4);
  return {
    id: RAIL_ID,
    kind: "card",
    displayName: "2fiat prepaid Mastercard",
    quote: async (amount) =>
      ({
        railId: RAIL_ID,
        kind: "card",
        amount,
        instructions: `Pay ${amount.amount} ${amount.currency} at merchant checkout with the 2fiat prepaid Mastercard ending ${last4}. 3DS may prompt — human-gate that step.`,
      }) satisfies PaymentQuote,
    pay: async (quote) =>
      ({
        status: "pending",
        reference: `card-checkout:${quote.railId}`,
      }) satisfies PaymentResult,
  };
}
