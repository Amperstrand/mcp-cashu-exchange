# @exchange/map

Map frontend for **mcp.cashu.exchange**.

## Current state (scaffold)

A dependency-free Leaflet page is served by the worker at `apps/worker/public/index.html`.
It reads:

- `GET /api/services` — catalog + providers
- `GET /api/charging?lat&lng&radiusKm` — station records from the berlin-charging plugin

## Graduate into a real app here when ready

1. `npm create vite@latest . -- --template preact-ts`
2. Fetch the same JSON endpoints (same contract, no backend change needed).
3. Add provider layers by category — every `ServiceProvider` record already
   carries `category`, `location`, `name`, `address`.
4. Pay-and-start markers: only for providers whose `act()` exists
   (hermes/silent.energy bridge, Norway). Berlin stays discovery + card rail.

## Data contract

See `@exchange/contracts` — `ServiceRecord` is the on-wire shape. Parse it with
Zod at this package's boundary; do not hand-roll validators.
