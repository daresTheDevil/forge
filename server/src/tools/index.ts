import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGitTools } from "./git.js";
import { registerDockerTools } from "./docker.js";
import { registerK8sTools } from "./k8s.js";
import { registerPnpmTools } from "./pnpm.js";

export function registerAllTools(server: McpServer): void {
  registerGitTools(server);
  registerDockerTools(server);
  registerK8sTools(server);
  registerPnpmTools(server);
}
