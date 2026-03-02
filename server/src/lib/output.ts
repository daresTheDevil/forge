import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function dualOutput<T extends object>(
  data: T,
  formatter: (d: T) => string
): CallToolResult {
  return {
    structuredContent: data as Record<string, unknown>,
    content: [{ type: "text", text: formatter(data) }],
  };
}
