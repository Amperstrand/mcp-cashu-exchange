import type { ServiceProvider, ServiceRecord } from "@exchange/contracts";
import { providerId, serviceId } from "@exchange/contracts";

const CINEMA_PROVIDER_ID = providerId("cinema");

/** Synthetic film entry: title, today's showtimes, and per-ticket price in sats. */
export interface Film {
  readonly title: string;
  readonly showtimes: readonly string[];
  readonly priceSats: number;
}

/**
 * Hackathon demo catalog — fully synthetic, three themed films.
 * Prices are intentionally tiny (signet sats) so demo wallets can afford them.
 */
export const FILMS: readonly Film[] = [
  { title: "Signal Lost", showtimes: ["19:30", "21:45"], priceSats: 12 },
  { title: "The Mint", showtimes: ["18:00", "20:15"], priceSats: 9 },
  { title: "Cash Only", showtimes: ["17:10", "22:00"], priceSats: 7 },
];

function filmToRecord(film: Film): ServiceRecord {
  return {
    id: serviceId(
      `cinema:film:${film.title.toLowerCase().replace(/\s+/g, "-")}`,
    ),
    providerId: CINEMA_PROVIDER_ID,
    category: "shopping",
    name: film.title,
    details: {
      kind: "generic",
      note: `Showtimes today: ${film.showtimes.join(", ")} · ${film.priceSats} sat per ticket`,
    },
  };
}

/**
 * Synthetic cinema box-office provider (category "shopping").
 * Discovery + honest details only; payment is settled by the chat layer via
 * Cashu ecash, not by this provider. All data is fixture — no real cinema.
 */
export function cinemaProvider(): ServiceProvider {
  return {
    id: CINEMA_PROVIDER_ID,
    category: "shopping",
    displayName: "Demo Cinema (synthetic box office)",
    search: async (query) => {
      const text = query.text?.toLowerCase();
      return FILMS.map(filmToRecord).filter(
        (record) =>
          text === undefined || record.name.toLowerCase().includes(text),
      );
    },
    details: async (id) => {
      const film = FILMS.find(
        (f) =>
          serviceId(
            `cinema:film:${f.title.toLowerCase().replace(/\s+/g, "-")}`,
          ) === id,
      );
      return {
        kind: "generic",
        note:
          film === undefined
            ? "Unknown film."
            : `${film.title} — showtimes today: ${film.showtimes.join(", ")} · ${film.priceSats} sat per ticket. Pay with Cashu ecash to book.`,
      };
    },
  };
}
