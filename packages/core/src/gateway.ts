import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface DownstreamConfig {
  readonly name: string;
  readonly url: string;
  readonly token?: string;
}

export interface DownstreamTools {
  readonly name: string;
  readonly ok: boolean;
  readonly tools: readonly string[];
  readonly error?: string;
}

/**
 * Lists tools from one federated downstream MCP server.
 * The gateway must stay resilient: a dead downstream degrades to
 * `{ ok: false }` instead of failing the whole exchange.
 */
export async function listDownstreamTools(
  downstream: DownstreamConfig,
): Promise<DownstreamTools> {
  const client = new Client({
    name: "mcp-cashu-exchange-gateway",
    version: "0.0.1",
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(downstream.url),
    downstream.token === undefined
      ? undefined
      : {
          requestInit: {
            headers: { Authorization: `Bearer ${downstream.token}` },
          },
        },
  );
  try {
    await client.connect(transport);
    const result = await client.listTools();
    return {
      name: downstream.name,
      ok: true,
      tools: result.tools.map((tool) => tool.name),
    };
  } catch (error: unknown) {
    return {
      name: downstream.name,
      ok: false,
      tools: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.close();
  }
}
