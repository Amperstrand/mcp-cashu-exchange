import { describe, expect, it } from "vitest";
import { app, type Env } from "../src/index.js";

function fakeCache(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as KVNamespace;
}

function env(): Env {
  return { CACHE: fakeCache() };
}

describe("GET /api/search", () => {
  it("serves the registry over REST and matches cinema names", async () => {
    const response = await app.request(
      "/api/search?category=shopping&text=friedrichshain",
      undefined,
      env(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      count: number;
      records: Array<{ name: string; details?: { note?: string } }>;
    };
    expect(body.count).toBe(1);
    expect(body.records[0]?.name).toBe("Primetime");
    expect(body.records[0]?.details?.note).toContain("Filmtheater am Friedrichshain");
  });

  it("rejects an unknown category with 400", async () => {
    const response = await app.request("/api/search?category=flights", undefined, env());
    expect(response.status).toBe(400);
  });

  it("lists the jamezz provider in /api/services", async () => {
    const response = await app.request("/api/services", undefined, env());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { providers: Array<{ id: string }> };
    expect(body.providers.map((p) => p.id)).toContain("jamezz");
  });
});
