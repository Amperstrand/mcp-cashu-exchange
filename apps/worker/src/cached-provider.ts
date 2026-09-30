import {
  providerId,
  SERVICE_CATEGORIES,
  type SearchQuery,
  type ServiceProvider,
  serviceId,
} from "@exchange/contracts";
import { z } from "zod";

const GeoPoint = z.object({ lat: z.number(), lng: z.number() });

const ChargingDetails = z.object({
  kind: z.literal("charging"),
  operator: z.string().optional(),
  socketTypes: z.array(z.string()),
  capacityKw: z.number().optional(),
});

const ServiceRecordSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  category: z.enum(SERVICE_CATEGORIES),
  name: z.string(),
  location: GeoPoint.optional(),
  address: z.string().optional(),
  url: z.string().optional(),
  details: ChargingDetails.optional(),
});

const CachedRecords = z.array(ServiceRecordSchema);

function cacheKey(query: SearchQuery): string {
  const lat = (query.near?.lat ?? 52.52).toFixed(2);
  const lng = (query.near?.lng ?? 13.405).toFixed(2);
  const radius = (query.radiusKm ?? 5).toFixed(0);
  return `charging:v1:${lat}:${lng}:${radius}`;
}

/** KV is an external store — cached payloads are parsed, never trusted. */
export function withKvCache(
  inner: ServiceProvider,
  cache: KVNamespace,
  ttlSeconds: number,
): ServiceProvider {
  return {
    ...inner,
    search: async (query) => {
      const key = cacheKey(query);
      const raw = await cache.get(key);
      if (raw !== null) {
        const parsed = CachedRecords.safeParse(JSON.parse(raw));
        if (parsed.success) {
          return parsed.data.map((record) => ({
            ...record,
            id: serviceId(record.id),
            providerId: providerId(record.providerId),
          }));
        }
      }
      const records = await inner.search(query);
      await cache.put(key, JSON.stringify(records), {
        expirationTtl: ttlSeconds,
      });
      return records;
    },
  };
}
