#!/usr/bin/env node
/**
 * Live smoke for the deployed exchange. Read-only; no secrets. Exit 1 on
 * any drift. Checks per issue #6: health, MCP tools list, food search,
 * cinema name matching.
 */
const BASE = process.env.SMOKE_BASE_URL ?? "https://mcp.cashu.exchange";

async function mcp(method, params) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`mcp ${method} HTTP ${response.status}`);
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: ")) ?? text;
  return JSON.parse(line.slice(6));
}

async function json(path) {
  const response = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json();
}

const failures = [];
function check(name, condition, detail) {
  if (condition) {
    console.log(`SMOKE OK ${name}`);
  } else {
    failures.push(name);
    console.error(`SMOKE FAIL ${name}${detail === undefined ? "" : `: ${detail}`}`);
  }
}

async function safe(name, fn) {
  try {
    return await fn();
  } catch (error) {
    failures.push(name);
    console.error(`SMOKE FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

const health = await safe("health", () => json("/health"));
check("health", health?.ok === true, JSON.stringify(health));

const tools = await safe("tools/list", () => mcp("tools/list"));
const names = (tools?.result?.tools ?? []).map((t) => t.name);
check("tools include directory", names.includes("directory.list_services"), names.join(","));
check("tools include payment.quote", names.includes("payment.quote"), names.join(","));

const food = await safe("food search", () => json("/api/search?category=food"));
check("food search non-empty", (food?.count ?? 0) >= 1, `count=${food?.count}`);

const cinema = await safe("cinema name matching", () =>
  json("/api/search?category=shopping&text=friedrichshain"),
);
check(
  "cinema name matching",
  cinema?.count === 1 && cinema.records?.[0]?.name === "Primetime",
  `${JSON.stringify(cinema)}`.slice(0, 120),
);

process.exit(failures.length > 0 ? 1 : 0);
