import { describe, expect, it } from "vitest";
import {
  DEFAULT_CENTER,
  DEFAULT_RADIUS_KM,
  searchStations,
  toRecord,
} from "../src/overpass.ts";

const stationTags: Record<string, string> = {
  amenity: "charging_station",
  name: "Hackathon Hub Charger",
  operator: "EnBW",
  "socket:type2": "2",
  "socket:type2_combo": "yes",
  "socket:chademo": "no",
  "charging_station:output": "22 kW",
  "addr:street": "Torstraße",
  "addr:housenumber": "1",
};

const fixture = {
  elements: [
    { type: "node" as const, id: 1, lat: 52.52, lon: 13.4, tags: stationTags },
    {
      type: "node" as const,
      id: 2,
      lat: 52.53,
      lon: 13.41,
      tags: { amenity: "charging_station", operator: "TankE" },
    },
    { type: "node" as const, id: 3 },
  ],
};

const fetchWithFixture: typeof fetch = async () =>
  new Response(JSON.stringify(fixture), {
    headers: { "content-type": "application/json" },
  });

async function searchFixture() {
  return searchStations(
    { near: DEFAULT_CENTER, radiusKm: DEFAULT_RADIUS_KM },
    fetchWithFixture,
  );
}

describe("overpass provider", () => {
  it("maps named elements with full tags when fixture contains them", async () => {
    const records = await searchFixture();
    expect(
      records.find((r) => r.name === "Hackathon Hub Charger"),
    ).toMatchObject({
      id: "osm:node:1",
      category: "charging",
      address: "Torstraße 1",
      location: { lat: 52.52, lng: 13.4 },
    });
  });

  it("carries charging details inline when tags carry them", async () => {
    const records = await searchFixture();
    expect(records.find((r) => r.id === "osm:node:1")?.details).toEqual({
      kind: "charging",
      operator: "EnBW",
      socketTypes: ["type2", "type2_combo"],
      capacityKw: 22,
    });
  });

  it("falls back to operator then generic name when name tag is absent", async () => {
    const records = await searchFixture();
    expect(records.map((r) => r.name)).toContain("TankE");
  });

  it("skips elements when coordinates are missing", async () => {
    const records = await searchFixture();
    expect(records.map((r) => r.id)).not.toContain("osm:node:3");
    expect(records).toHaveLength(2);
  });

  it("omits charging details when only the operator is known", () => {
    const record = toRecord({
      type: "node",
      id: 2,
      lat: 52.53,
      lon: 13.41,
      tags: { amenity: "charging_station", operator: "TankE" },
    });
    expect(record?.details).toEqual({
      kind: "charging",
      operator: "TankE",
      socketTypes: [],
    });
  });
});
