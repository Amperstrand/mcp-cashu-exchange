import type { ServiceProvider } from "@exchange/contracts";
import { providerId } from "@exchange/contracts";
import {
  DEFAULT_CENTER,
  DEFAULT_RADIUS_KM,
  searchStations,
} from "./overpass.ts";

export { OverpassUnavailableError } from "./overpass.ts";

/**
 * Berlin EV charging, sourced live from OpenStreetMap via Overpass.
 * Discovery only for now: payment happens at the operator (card rail),
 * honestly framed — no fake "start charging" claims for Berlin.
 */
export function berlinChargingProvider(): ServiceProvider {
  return {
    id: providerId("berlin-charging"),
    category: "charging",
    displayName: "Berlin EV charging (OSM/Overpass)",
    search: (query) =>
      searchStations({
        near: query.near ?? DEFAULT_CENTER,
        radiusKm: query.radiusKm ?? DEFAULT_RADIUS_KM,
        ...(query.text === undefined ? {} : { text: query.text }),
      }),
    details: async () => ({
      kind: "generic",
      note: "Per-station details (sockets, operator, capacity) are returned inline in search records; re-query Overpass for fresh tags.",
    }),
  };
}
