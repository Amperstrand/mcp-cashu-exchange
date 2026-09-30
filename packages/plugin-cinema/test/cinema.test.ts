import { describe, expect, it } from "vitest";
import { cinemaProvider, FILMS } from "../src/index.ts";

describe("cinema provider", () => {
  it("lists tonight's real Berlin films on a blank search", async () => {
    const provider = cinemaProvider();
    const records = await provider.search({ category: "shopping" });
    expect(records).toHaveLength(3);
    expect(records.map((r) => r.name)).toEqual([
      "Primetime",
      "Vaterland",
      "Das geträumte Abenteuer",
    ]);
  });

  it("tags every record with the shopping category and cinema provider id", async () => {
    const provider = cinemaProvider();
    const records = await provider.search({ category: "shopping" });
    for (const record of records) {
      expect(record.category).toBe("shopping");
      expect(record.providerId).toBe("cinema");
      expect(record.details?.kind).toBe("generic");
    }
  });

  it("filters by text substring, case-insensitive", async () => {
    const provider = cinemaProvider();
    const records = await provider.search({
      category: "shopping",
      text: "abenteuer",
    });
    expect(records.map((r) => r.name)).toEqual(["Das geträumte Abenteuer"]);
  });

  it("carries cinema, showtimes and price in the generic details note", async () => {
    const provider = cinemaProvider();
    const records = await provider.search({ category: "shopping" });
    const primetime = records.find((r) => r.name === "Primetime");
    expect(primetime?.details).toEqual({
      kind: "generic",
      note: "Filmtheater am Friedrichshain · today 20:40 · 20 sat per ticket",
    });
  });

  it("resolves details for a known film id", async () => {
    const provider = cinemaProvider();
    const record = (await provider.search({ category: "shopping" }))[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    const details = await provider.details(record.id);
    expect(details.kind).toBe("generic");
    if (details.kind === "generic") {
      expect(details.note).toContain("sat per ticket");
    }
  });

  it("catalog prices stay in the affordable signet-demo range", () => {
    for (const film of FILMS) {
      expect(film.priceSats).toBeGreaterThan(0);
      expect(film.priceSats).toBeLessThanOrEqual(20);
      expect(film.showtimes.length).toBeGreaterThan(0);
    }
  });
});
