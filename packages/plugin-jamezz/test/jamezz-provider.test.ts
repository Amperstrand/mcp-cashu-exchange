import { describe, expect, it } from "vitest";
import { jamezzProvider } from "../src/index.js";

const ORIGIN = "https://qrv5.jamezz.app";

function jsonResponse(
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Minimal synthetic Jamezz transport (see jamezz prompts/write-tests.md). */
function fakeJamezz(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `${ORIGIN}/v5/qr/8613S3X`) {
      return new Response("<html>qr</html>", {
        headers: { "set-cookie": "jamezz_app_session=synthetic; Path=/" },
      });
    }
    if (url.startsWith(`${ORIGIN}/v5_2/qr/salesarea-fetch`)) {
      return jsonResponse({
        status: "ok",
        data: {
          salesarea: {
            systeemNaam: "Burgermeister Mehringdamm - QR (synthetic)",
            valuta: "EUR",
            payProvider: "MOLLIE",
            systemOnline: 1,
          },
        },
      });
    }
    if (url === `${ORIGIN}/v5_2/qr/data-fetch-v2`) {
      return jsonResponse({
        status: "ok",
        data: {
          menukaarts: [
            { id: "1", naam: "Burger", sortkey: 1, showInCategoryMenu: 1 },
          ],
          menukaart_products: [{ menukaart_id: 1, product_id: 101 }],
          products: [{ id: "101", naam: "Cheeseburger", price: 6.4 }],
        },
      });
    }
    return jsonResponse({ status: "error", error: `unrouted ${url}` });
  }) as typeof fetch;
}

describe("jamezzProvider", () => {
  it("returns food records with venue, PSP, and menu previews for every mapped table", async () => {
    const provider = jamezzProvider({ fetchImpl: fakeJamezz() });
    const records = await provider.search({ category: "food" });
    expect(records).toHaveLength(4);
    const mehringdamm = records.find((r) => r.id.includes("8613S3X"));
    if (mehringdamm === undefined)
      throw new Error("expected the Mehringdamm record");
    expect(mehringdamm.name).toBe("Burgermeister Mehringdamm - QR (synthetic)");
    expect(mehringdamm.category).toBe("food");
    expect(mehringdamm.address).toContain("Mehringdamm");
    const details = mehringdamm.details;
    if (details?.kind !== "generic")
      throw new Error("expected generic details");
    expect(details.note).toContain("8613S3X");
    expect(details.note).toContain("MOLLIE hosted checkout");
    expect(details.note).toContain("Cheeseburger 6.40 EUR");
  });

  it("filters by text and answers details() with the full menu", async () => {
    const provider = jamezzProvider({ fetchImpl: fakeJamezz() });
    expect(await provider.search({ category: "food", text: "oslo" })).toEqual(
      [],
    );
    const [record] = await provider.search({
      category: "food",
      text: "mehringdamm",
    });
    if (record === undefined) throw new Error("expected a record");
    const details = await provider.details(record.id);
    if (details.kind !== "food") throw new Error("expected food details");
    expect(details.venue).toBe("Burgermeister Mehringdamm - QR (synthetic)");
    expect(details.currency).toBe("EUR");
    expect(details.categories[0]?.name).toBe("Burger");
    expect(details.categories[0]?.items[0]).toEqual({
      name: "Cheeseburger",
      price: 6.4,
    });
  });

  it("degrades every table to its static entry when the venue API is unreachable", async () => {
    const broken: typeof fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const provider = jamezzProvider({ fetchImpl: broken });
    const records = await provider.search({ category: "food" });
    expect(records).toHaveLength(4);
    for (const record of records) {
      const details = record.details;
      if (details?.kind !== "generic")
        throw new Error("expected generic details");
      expect(details.note).toContain("venue API unreachable");
      expect(record.name.length).toBeGreaterThan(0);
    }
  });
});
