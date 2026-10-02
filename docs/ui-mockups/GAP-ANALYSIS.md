# Gap analysis — pizza ordering with bitcoin + ring-signature facilitator vetting

Repo: `github.com/felixfelix-bot/mcp-cashu-exchange` @ `feat/trust-ring`
Date: 2026-10-01 · target: BTC++ demo

---

## 1. Does Amperstrand already have a UI for ordering things?

**Yes — one, and it is a chat box office.** Not a catalogue, not a checkout.

| Page | Lines | What it does |
|------|-------|--------------|
| `apps/worker/public/berlin.html` | 193 | The real one. Live at chat.cashu.exchange. Free-text request → `POST /api/chat` → bot reply + an **offer card** (title, `amount_sats`) → user **pastes a Cashu token** into a `<textarea>` → `POST /api/chat/pay` → ticket codes rendered as dashed chips. |
| `apps/worker/public/map.html` | 88 | Map of services (charging, Berlin). |
| `apps/worker/public/index.html` | 11 | Stub. |
| `apps/worker/public/demo.html` | 11 | Redirect stub → chat.cashu.exchange. |

Total user-facing UI: **303 lines of static HTML, three pages, one payment method.**
It is a good demo shell — free text in, an offer with a sats price, a payment step,
a deliverable out. But it is cinema-shaped and ecash-only.

**Exists in code, has no UI at all:**

- `plugin-cinema` (Yorck programme), `plugin-berlin-charging`, `plugin-pay-2fiat`
  (prepaid Mastercard rail) — all headless.
- The whole gateway/MCP surface: `POST /mcp`, `GET /api/services`, `GET /api/charging`.
  Machine-facing.
- Our `plugin-trust-ring`: headless package + CLI demo + the harness I built.
  **Neither side of the trust proof has a screen.**

### Answer to "is there a pizza UI?"
**No.** There is no restaurant/food plugin, no menu, no basket, no delivery address,
no order state, no pizza anything. The word "food" appears only in the repo
description (`charging, food`). Shipped verticals are **cinema** and **charging**.

---

## 2. What is missing for "order a pizza with bitcoin while vetting the facilitator"

| # | Gap | Evidence | Severity for the demo |
|---|-----|----------|----------------------|
| G1 | **No pizza/restaurant vertical** — menu, basket, delivery address, ETA, order state machine | only `plugin-cinema`, `plugin-berlin-charging` exist | blocks the story |
| G2 | **No bitcoin payment path.** Only Cashu ecash, via a textarea paste | `berlin.html:116-119` (`ta.placeholder = "cashuAey…"`); no invoice, no QR, no status polling | blocks "order pizza **with bitcoin**" |
| G3 | **No facilitator-facing UI.** The party who takes the order and delivers has no screen; the trust proof can only be produced by running our package in Node | `plugin-trust-ring` is headless | blocks the stage beat |
| G4 | **No buyer-side trust-set UI.** The buyer never sees the pinned set, its version hash, publish date, or who vouched | trust set is an invisible input argument | blocks comprehension |
| G5 | **No verification UX.** Nothing renders what the verifier checks — pin match, ring ⊆ pinned set, min ring size, order binding, expiry, key-image one-use — nor the anonymity guarantee | policy lives in `verify.ts`, returns a machine object | this is the *whole point* and it is invisible |
| G6 | **No rejection UX.** The four attacks are library tests; a user who picks a non-vetted facilitator gets nothing | `test/trust-ring.test.ts` negatives | demo needs the visible "blocked" |
| G7 | **No order lifecycle/tracking**, and no tie between delivery and payout | — | weakens "end to end" |
| G8 | **Trust-set bootstrapping is unsolved at UI level**: where does the buyer's list come from on day one? | recommendation only, in the BitBlik design note | can be staged, must be *said* |

---

## 3. Recommendations, in priority order

**R1 — NOW, demo-critical. Make facilitator vetting a *first-class checkout step*, not a hidden check.**
A screen between "choose facilitator" and "pay" that shows: the pinned trust set
(name, member count, publish date, content hash), the proof (ring of N drawn from
that set), the six checks with their real verdicts, and the anonymity line —
*"a member of your set signed this order; we did not learn which one."*
This is the single screen that makes a ring signature visible to a human.

**R2 — NOW. A bitcoin payment screen.** BOLT11 Lightning invoice (QR + copy +
open-in-wallet) as primary, Cashu ecash paste as the existing secondary, both
behind one "Pay". Keep the 2fiat card rail for a later beat.

**R3 — NOW. A facilitator operator app.** Minimal, one screen, two states:
incoming order → *"the buyer pinned trust set X; prove you are in it"* → one tap
→ proof generated (ring drawn from **their** set) → order accepted, key image
locked for this order → payout on delivery.

**R4 — SOON. Buyer trust-set manager.** View/import/publish the list; per-member
basis (`met-in-person` / `vouched` / `seed`), added-at, expiry. Reuse the NIP-51
list + kind 39089 starter-pack shape already designed for BitBlik.

**R5 — SOON. Wire the rejection screen to the policy's real reason strings** —
each of the four attacks maps 1:1 to a visible message.

**R6 — SOON. Order tracking with payout release tied to delivery.** Today the
proof says nothing about whether the pizza arrived; the honest model is a release
on delivery, not a release on proof.

**R7 — DEFER. A real pizza vertical plugin** (`plugin-restaurant`). For the demo a
static menu served by the existing worker is enough — no new infra needed.

### Where it goes

- **Buyer flow:** a new `apps/worker/public/order.html`. Do **not** restructure
  `berlin.html` — his cinema demo must keep working through the demo window.
- **Facilitator:** a new `apps/worker/public/facilitator.html`.
- **Trust core:** the shipped `plugin-trust-ring` unchanged.
- All three are static pages on the worker that already serves `berlin.html`.

---

## 4. Honest limitations to state out loud on stage

1. A ring signature proves **membership in a set the verifier pinned**. It does not
   prove the facilitator is honest, solvent, or good at delivery.
2. **Anonymity set ≤ |trust set|.** A 4-member ring means 1-in-4, not anonymity
   from the world.
3. The proof binds the **order** (id, amount, currency, client, expiry) — it does
   not escrow the sats. Fraud resistance needs an economic bond, which is a
   different mechanism.
4. Padding the ring with untrusted decoys is **unsound** (a ring sig only proves
   "one ring member signed"), so a curated list means a small anonymity set.
   Accepted and declared, per ADR 0002 on the BitBlik side.

---

## 5. What the demo video should show (replaces the current checklist video)

The video I sent ran the library's own beats. The user-facing version walks a
**buyer** and a **facilitator** through one pizza order on two screens:

1. Buyer: pick a pizzeria, build a basket — *this part partly exists as chat*
2. Buyer: pick who fulfils — badges show who is in their trust set
3. Buyer: **vetting screen** — pin, ring proof, six checks, anonymity line
4. Buyer: pay the Lightning invoice
5. Facilitator: incoming order → prove membership → accept
6. Buyer: tracking → delivered, sats released
7. Failure beat: a facilitator outside the set is refused, **nothing is charged**

Beats 3, 5 and 7 are the new UI. Beats 1, 2 and 4 exist only as the cinema chat
and must be built for pizza.
