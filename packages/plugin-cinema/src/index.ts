import type { ServiceProvider, ServiceRecord } from "@exchange/contracts";
import { providerId, serviceId } from "@exchange/contracts";

const CINEMA_PROVIDER_ID = providerId("cinema");

export const CAPTURED_AT = "2026-09-30";

/** Film entry: title, today's showtimes, per-ticket price in sats, optional cinema. */
export interface Film {
  readonly title: string;
  readonly showtimes: readonly string[];
  readonly priceSats: number;
  readonly cinema?: string;
}

/**
 * Demo programme — one evening's Yorck screenings in Berlin (captured
 * 2026-09-30, evening shows only). Stale by design: the capture date is in
 * CAPTURED_AT and in the provider's displayName. Refresh = replace FILMS
 * and CAPTURED_AT. Prices are demo-mint sats.
 */
export const FILMS: readonly Film[] = [
  {
    title: "Primetime",
    cinema: "Filmtheater am Friedrichshain",
    showtimes: ["20:40"],
    priceSats: 20,
  },
  {
    title: "Vaterland",
    cinema: "Delphi Filmpalast",
    showtimes: ["20:20"],
    priceSats: 18,
  },
  {
    title: "Das geträumte Abenteuer",
    cinema: "Kant Kino",
    showtimes: ["19:30"],
    priceSats: 15,
  },
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
      note: `${film.cinema ?? "Berlin"} · today ${film.showtimes.join(", ")} · ${film.priceSats} sat per ticket`,
    },
  };
}

/**
 * Cinema box-office provider (category "shopping") over the real Berlin
 * programme. Discovery + details only; payment is settled by the chat
 * layer via Cashu ecash, not by this provider.
 */
export function cinemaProvider(): ServiceProvider {
  return {
    id: CINEMA_PROVIDER_ID,
    category: "shopping",
    displayName: `Berlin cinema tonight (Yorck capture ${CAPTURED_AT} — demo data)`,
    search: async (query) => {
      const text = query.text?.toLowerCase();
      return FILMS.map(filmToRecord).filter((record) => {
        if (text === undefined) return true;
        const film = FILMS.find((f) => filmToRecord(f).id === record.id);
        const haystack = `${record.name} ${film?.cinema ?? ""}`.toLowerCase();
        return haystack.includes(text);
      });
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
