import type {
  SearchQuery,
  ServiceDetails,
  ServiceId,
  ServiceProvider,
  ServiceRecord,
} from "@exchange/contracts";
import { providerId, serviceId } from "@exchange/contracts";
import { JamezzClient, KNOWN_TABLES } from "jamezz";

const PROVIDER_ID = providerId("jamezz");

export interface JamezzProviderOptions {
  /** Inject a fake transport in tests; defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
}

function recordId(mid: string): string {
  return `jamezz:table:${mid}`;
}

interface VenueSnapshot {
  readonly name: string;
  readonly address: string | undefined;
  readonly url: string | undefined;
  readonly note: string;
}

/**
 * One table = one service record. Live reads are read-only (venue config +
 * menu); failures degrade to the static catalog entry, never throw — the
 * venue API being down must not take the exchange's search down with it.
 */
async function snapshot(
  client: JamezzClient,
  table: (typeof KNOWN_TABLES)[number],
): Promise<ServiceRecord> {
  let venueInfo: VenueSnapshot | undefined;
  try {
    const venue = await client.venue(table.mid);
    const menu = await client.menu(table.mid);
    const items =
      menu?.categories
        .flatMap((category) => category.items)
        .slice(0, 3)
        .map(
          (item) => `${item.name} ${item.price.toFixed(2)} ${item.currency}`,
        ) ?? [];
    venueInfo = {
      name: venue?.name ?? table.name,
      address: venue?.address ?? table.address,
      url: venue?.website,
      note:
        `QR table ${table.mid} · ${venue?.payProvider ?? "PSP"} hosted checkout · ` +
        (items.length > 0 ? items.join(" · ") : "menu unavailable right now"),
    };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    venueInfo = undefined; // degrade to the static entry below
  }
  return {
    id: serviceId(recordId(table.mid)),
    providerId: PROVIDER_ID,
    category: "food",
    name: venueInfo?.name ?? table.name,
    address: venueInfo?.address ?? table.address,
    url: venueInfo?.url,
    details: {
      kind: "generic",
      note:
        venueInfo?.note ??
        `QR table ${table.mid} · venue API unreachable · ${table.note}`,
    },
  };
}

/**
 * Jamezz table-ordering provider (category "food") over the public jamezz
 * package. Discovery + menu preview only — placing an order and paying stay
 * with the package's client and the merchant's hosted checkout page
 * (docs/PAYMENT.md). That split is deliberate: the exchange answers "what
 * and where", the participant's own tools answer "buy".
 */
export function jamezzProvider(
  options: JamezzProviderOptions = {},
): ServiceProvider {
  const client =
    options.fetchImpl === undefined
      ? new JamezzClient()
      : new JamezzClient({ fetchImpl: options.fetchImpl });
  return {
    id: PROVIDER_ID,
    category: "food",
    displayName: "Jamezz table ordering (Burgermeister worked example)",
    async search(query: SearchQuery): Promise<readonly ServiceRecord[]> {
      const needle = query.text?.toLowerCase();
      const records: ServiceRecord[] = [];
      for (const table of KNOWN_TABLES) {
        if (
          needle !== undefined &&
          !table.name.toLowerCase().includes(needle)
        ) {
          continue;
        }
        records.push(await snapshot(client, table));
      }
      return records;
    },
    async details(id: ServiceId): Promise<ServiceDetails> {
      const mid = id.slice("jamezz:table:".length);
      const table = KNOWN_TABLES.find((entry) => entry.mid === mid);
      if (table === undefined) {
        return { kind: "generic", note: `unknown table ${mid}` };
      }
      try {
        const menu = await client.menu(table.mid);
        if (menu !== null) {
          return {
            kind: "food",
            venue: menu.venueName,
            currency: menu.currency,
            categories: menu.categories.map((category) => ({
              name: category.name,
              items: category.items.map((item) => ({
                name: item.name,
                price: item.price,
              })),
            })),
          };
        }
      } catch (error) {
        if (!(error instanceof Error)) throw error;
      }
      return {
        kind: "generic",
        note: `QR table ${table.mid} · menu unavailable right now · ${table.note}`,
      };
    },
  };
}
