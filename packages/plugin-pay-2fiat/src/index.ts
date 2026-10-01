import type { PaymentQuote, PaymentRail, PaymentResult } from "@exchange/contracts";
import { railId } from "@exchange/contracts";

const RAIL_ID = railId("2fiat-card");

/**
 * The "card" payment rail — credential-free by design.
 *
 * No card number, expiry, or CVC ever enters this repo, its worker secrets,
 * or any tool response. The charge happens at the merchant's hosted checkout
 * (e.g. Mollie for Jamezz venues): the participant opens the checkout URL and
 * pays with their own card — a 2fiat prepaid Mastercard or any personal card.
 * 3DS / OTP prompts are the participant's to answer.
 */
export function ownCardRail(): PaymentRail {
  return {
    id: RAIL_ID,
    kind: "card",
    displayName: "Your own card (2fiat or personal)",
    quote: async (amount) =>
      ({
        railId: RAIL_ID,
        kind: "card",
        amount,
        instructions:
          `Open the merchant checkout URL and pay ${amount.amount} ${amount.currency} with your own card ` +
          "(a 2fiat prepaid Mastercard or any personal card). Card details go only into the merchant's " +
          "hosted payment page — never into a prompt, repo, or tool. Answer any 3DS prompt yourself.",
      }) satisfies PaymentQuote,
    pay: async (quote) =>
      ({
        status: "pending",
        reference: `own-card-checkout:${quote.railId}`,
      }) satisfies PaymentResult,
  };
}
