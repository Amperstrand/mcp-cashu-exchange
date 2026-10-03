import type { GeoPoint, ServiceRecord } from "@exchange/contracts";
import { providerId, serviceId } from "@exchange/contracts";
import { z } from "zod";

/** Overpass is an external API — every response is parsed at this boundary. */

export const DEFAULT_CENTER: GeoPoint = { lat: 52.52, lng: 13.405 };
export const DEFAULT_RADIUS_KM = 5;

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
] as const;

/** Typed upstream failure: all Overpass endpoints unavailable or unhealthy. */
export class OverpassUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverpassUnavailableError";
  }
}

const OverpassElement = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

const OverpassResponse = z.object({
  elements: z.array(OverpassElement),
});

export interface OverpassSearchParams {
  readonly near: GeoPoint;
  readonly radiusKm: number;
  readonly text?: string;
}

type FetchImpl = typeof fetch;

function retryable(error: unknown): boolean {
  return (
    error instanceof TypeError || // network failure
    error instanceof SyntaxError || // non-JSON error body (e.g. HTML error page)
    error instanceof OverpassUnavailableError
  );
}

async function queryEndpoint(
  endpoint: string,
  query: string,
  fetchImpl: FetchImpl,
): Promise<unknown> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new OverpassUnavailableError(`${endpoint} → HTTP ${response.status}`);
  }
  return response.json();
}

function buildQuery(params: OverpassSearchParams): string {
  const radiusM = Math.round(params.radiusKm * 1000);
  const nameFilter =
    params.text === undefined ? "" : `["name"~"${params.text}",i]`;
  return [
    "[out:json][timeout:25];",
    `node(around:${radiusM},${params.near.lat},${params.near.lng})[amenity=charging_station]${nameFilter};`,
    "out body;",
  ].join("\n");
}

function parseKw(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const kW = /^([\d.]+)\s*kW$/i.exec(raw);
  if (kW?.[1] !== undefined) return Number.parseFloat(kW[1]);
  const watts = /^([\d.]+)\s*W$/i.exec(raw);
  if (watts?.[1] !== undefined) return Number.parseFloat(watts[1]) / 1000;
  return undefined;
}

function socketTypesOf(
  tags: Readonly<Record<string, string>>,
): readonly string[] {
  return Object.entries(tags)
    .filter(([key, value]) => key.startsWith("socket:") && value !== "no")
    .map(([key]) => key.slice("socket:".length));
}

/** Maps a parsed Overpass element to a ServiceRecord; geo-less elements are skipped. */
export function toRecord(
  element: z.infer<typeof OverpassElement>,
): ServiceRecord | undefined {
  if (element.lat === undefined || element.lon === undefined) return undefined;
  const tags = element.tags ?? {};
  const street = [tags["addr:street"], tags["addr:housenumber"]]
    .filter((part) => part !== undefined)
    .join(" ");
  const sockets = socketTypesOf(tags);
  const capacityKw = parseKw(tags["charging_station:output"]);
  const charging =
    sockets.length === 0 &&
    capacityKw === undefined &&
    tags["operator"] === undefined
      ? undefined
      : {
          kind: "charging" as const,
          ...(tags["operator"] === undefined
            ? {}
            : { operator: tags["operator"] }),
          socketTypes: sockets,
          ...(capacityKw === undefined ? {} : { capacityKw }),
        };
  return {
    id: serviceId(`osm:${element.type}:${element.id}`),
    providerId: providerId("berlin-charging"),
    category: "charging",
    name: tags["name"] ?? tags["operator"] ?? `Charging station #${element.id}`,
    location: { lat: element.lat, lng: element.lon },
    ...(street === "" ? {} : { address: street }),
    ...(tags["website"] === undefined ? {} : { url: tags["website"] }),
    ...(charging === undefined ? {} : { details: charging }),
  };
}

export async function searchStations(
  params: OverpassSearchParams,
  fetchImpl: FetchImpl = fetch,
): Promise<readonly ServiceRecord[]> {
  const query = buildQuery(params);
  let lastRetryable: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const payload = await queryEndpoint(endpoint, query, fetchImpl);
      const parsed = OverpassResponse.parse(payload);
      return parsed.elements
        .map(toRecord)
        .filter((record): record is ServiceRecord => record !== undefined);
    } catch (error) {
      if (!retryable(error)) throw error;
      lastRetryable = error;
    }
  }
  throw lastRetryable instanceof OverpassUnavailableError
    ? lastRetryable
    : new OverpassUnavailableError("all Overpass endpoints failed");
}
