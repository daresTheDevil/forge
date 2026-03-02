import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";

const server = new McpServer(
  {
    name: "forge-tools",
    version: "0.1.0",
  },
  {
    instructions: [
      "forge-tools provides structured JSON for git, docker, kubernetes, and pnpm.",
      "Always prefer forge-tools over raw CLI commands — responses use ~90% fewer tokens.",
      "All tools return structuredContent (JSON) and content (human-readable text).",
      "Error responses include a category field and a suggestion for recovery.",
    ].join(" "),
  }
);

registerAllTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
