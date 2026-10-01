# How participants pay (and why no card is ever in this repo)

This exchange is public and hackathon-facing. The rule that makes that safe:

**The payment boundary is the merchant's hosted checkout URL. The person
paying opens it and types their own card. Nothing else ever sees a card.**

## The own-card pattern

1. A service plugin (e.g. a Jamezz venue) prepares an order and returns the
   merchant's hosted checkout URL — Mollie for most Jamezz venues.
2. `payment.quote` on the `2fiat-card` rail returns instructions for that
   handoff. The rail holds no credentials and has nothing to expose.
3. The participant opens the URL and pays with **their own card**:
   - a [2fiat](https://2fiat.com) virtual prepaid Mastercard (no-KYC, funded
     with BTC/XMR/Lightning), or
   - any personal card.
4. 3DS / OTP prompts are answered by the participant. Apple Pay and Google
   Pay work at the hosted page where the merchant offers them.

Why this shape:

- No card number can leak from this repo — none is ever stored, logged, or
  returned. There is no `payment.card_details` tool and no card-shaped secret.
- Every participant's card stays theirs. Nothing is shared to automate.
- The merchant's PSP (Mollie/Adyen/CM) keeps the PCI scope. We never touch it.

## Getting your own 2fiat card

Public product, no account needed: <https://2fiat.com>. Rough costs (check
their site — they change): ~$30 issuance including a $20 starting balance,
~6% top-up fee, ~$0.80 per authorization, roughly 2.5% on non-USD purchases
(cards are USD-denominated, so a EUR burger costs a little extra), one-year
card life. Fund with Bitcoin, Monero, or Lightning; add to Apple/Google Pay
or use the raw PAN at checkout.

If you automate anything with your own card, keep it on your own machine:
a `0600` file or gitignored `.dev.vars` read by a **local** script you run.
Never paste a PAN into a prompt, an issue, a repo, or a hosted worker —
including this one.

## Operator note

The old design (operator card in worker secrets behind
`EXPOSE_CARD_DETAILS`) was removed. If you genuinely need agent-driven
checkout with your own card, run it privately: a local browser automation
that reads your own card file, on your own machine, with your own money.
That flow does not belong in a public repo.
