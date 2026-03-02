import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { run } from "../lib/runner.js";
import { dualOutput } from "../lib/output.js";
import { assertNoFlagInjection, assertNoFlagInjectionList } from "../lib/validation.js";
import { handleRunError, makeError } from "../lib/errors.js";
import type {
  K8sGet,
  K8sApply,
  K8sDescribe,
  K8sLogs,
  K8sExec,
  K8sDelete,
  K8sRollout,
  K8sContext,
  K8sUseContext,
} from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nsArgs(namespace?: string): string[] {
  return namespace ? ["-n", namespace] : [];
}

interface K8sItemMeta {
  name?: string;
  namespace?: string;
  creationTimestamp?: string;
}

interface K8sItemStatus {
  phase?: string;
  conditions?: Array<{ type: string; status: string }>;
  readyReplicas?: number;
  replicas?: number;
}

interface K8sItem {
  kind?: string;
  metadata?: K8sItemMeta;
  status?: K8sItemStatus;
}

interface K8sListResponse {
  kind?: string;
  items?: K8sItem[];
  metadata?: K8sItemMeta;
  status?: K8sItemStatus;
}

function extractReadyStatus(item: K8sItem): string | undefined {
  if (item.status?.readyReplicas !== undefined && item.status?.replicas !== undefined) {
    return `${item.status.readyReplicas}/${item.status.replicas}`;
  }
  const conds = item.status?.conditions ?? [];
  const ready = conds.find((c) => c.type === "Ready");
  return ready ? ready.status : undefined;
}

function computeAge(createdAt?: string): string | undefined {
  if (!createdAt) return undefined;
  const diff = Date.now() - new Date(createdAt).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function registerK8sTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // k8s_get
  // -------------------------------------------------------------------------
  server.tool(
    "k8s_get",
    "Get Kubernetes resources",
    {
      kind: z.string().describe("Resource kind (e.g. pods, deployments, services)"),
      namespace: z.string().optional().describe("Namespace (omit for cluster-scoped)"),
      name: z.string().optional().describe("Specific resource name"),
      labelSelector: z.string().optional().describe("Label selector (e.g. app=myapp)"),
    },
    async ({ kind, namespace, name, labelSelector }) => {
      try {
        assertNoFlagInjection(kind, "kind");
        if (name) assertNoFlagInjection(name, "name");
        if (labelSelector) assertNoFlagInjection(labelSelector, "labelSelector");

        const args = ["get", kind];
        if (name) args.push(name);
        args.push(...nsArgs(namespace));
        if (labelSelector) args.push("-l", labelSelector);
        args.push("-o", "json");

        const result = await run("kubectl", args);
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "kubectl get failed",
            "Check the resource kind and namespace",
            { exitCode: result.exitCode }
          );
        }

        const parsed = JSON.parse(result.stdout) as K8sListResponse;

        // Wrap single item in array
        const rawItems: K8sItem[] = parsed.items ?? [parsed as K8sItem];

        const items: K8sGet["items"] = rawItems.map((item) => ({
          kind: item.kind ?? kind,
          name: item.metadata?.name ?? "",
          namespace: item.metadata?.namespace,
          status: item.status?.phase ?? item.status?.conditions?.[0]?.type,
          ready: extractReadyStatus(item),
          age: computeAge(item.metadata?.creationTimestamp),
        }));

        const data: K8sGet = {
          kind,
          namespace,
          items,
          total: items.length,
        };

        return dualOutput(
          data,
          (d) =>
            `${d.total} ${d.kind}${d.namespace ? ` in ${d.namespace}` : ""}:\n` +
            d.items
              .map((i) => `  ${i.name}${i.status ? ` (${i.status})` : ""}${i.ready ? ` ready=${i.ready}` : ""}`)
              .join("\n")
        );
      } catch (e) {
        return handleRunError(e, "kubectl");
      }
    }
  );

  // -------------------------------------------------------------------------
  // k8s_apply
  // -------------------------------------------------------------------------
  server.tool(
    "k8s_apply",
    "Apply a Kubernetes manifest file",
    {
      file: z.string().describe("Path to the manifest file or directory"),
    },
    async ({ file }) => {
      try {
        assertNoFlagInjection(file, "file");

        const result = await run("kubectl", ["apply", "-f", file]);
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "kubectl apply failed",
            "Check the manifest file for syntax errors",
            { exitCode: result.exitCode }
          );
        }

        // Parse lines like: "deployment.apps/myapp created"
        const applied: K8sApply["applied"] = [];
        for (const line of (result.stdout + result.stderr).split("\n")) {
          const m = line.match(/^([\w./-]+)\/([\w-]+)\s+(created|configured|unchanged)$/);
          if (m) {
            const kindRaw = m[1] ?? "";
            const shortKind = kindRaw.split("/")[0] ?? kindRaw;
            applied.push({
              kind: shortKind,
              name: m[2] ?? "",
              action: m[3] as "created" | "configured" | "unchanged",
            });
          }
        }

        const data: K8sApply = { applied, total: applied.length };
        return dualOutput(
          data,
          (d) =>
            `Applied ${d.total} resource(s):\n` +
            d.applied.map((a) => `  ${a.kind}/${a.name}: ${a.action}`).join("\n")
        );
      } catch (e) {
        return handleRunError(e, "kubectl");
      }
    }
  );

  // -------------------------------------------------------------------------
  // k8s_describe
  // -------------------------------------------------------------------------
  server.tool(
    "k8s_describe",
    "Describe a Kubernetes resource",
    {
      kind: z.string().describe("Resource kind"),
      name: z.string().describe("Resource name"),
      namespace: z.string().optional().describe("Namespace"),
    },
    async ({ kind, name, namespace }) => {
      try {
        assertNoFlagInjection(kind, "kind");
        assertNoFlagInjection(name, "name");

        const args = ["describe", kind, name, ...nsArgs(namespace)];
        const result = await run("kubectl", args);

        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "kubectl describe failed",
            "Check that the resource exists in the given namespace",
            { exitCode: result.exitCode }
          );
        }

        const data: K8sDescribe = {
          kind,
          name,
          namespace: namespace ?? "default",
          raw: result.stdout,
        };

        return dualOutput(data, (d) => d.raw);
      } catch (e) {
        return handleRunError(e, "kubectl");
      }
    }
  );

  // -------------------------------------------------------------------------
  // k8s_logs
  // -------------------------------------------------------------------------
  server.tool(
    "k8s_logs",
    "Get logs from a Kubernetes pod",
    {
      pod: z.string().describe("Pod name"),
      namespace: z.string().optional().describe("Namespace"),
      container: z.string().optional().describe("Container name (for multi-container pods)"),
      lines: z.number().default(100).describe("Number of lines to fetch"),
    },
    async ({ pod, namespace, container, lines }) => {
      try {
        assertNoFlagInjection(pod, "pod");
        if (container) assertNoFlagInjection(container, "container");

        const args = ["logs", pod, ...nsArgs(namespace), `--tail=${lines}`, "--timestamps"];
        if (container) args.push("-c", container);

        const result = await run("kubectl", args);
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "kubectl logs failed",
            "Check that the pod exists and is running",
            { exitCode: result.exitCode }
          );
        }

        const rawLines = result.stdout.split("\n").filter((l) => l.trim().length > 0);
        const parsedLines: K8sLogs["lines"] = rawLines.map((l) => {
          const tsMatch = l.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)$/);
          if (tsMatch) {
            return { timestamp: tsMatch[1], text: tsMatch[2] ?? "" };
          }
          return { text: l };
        });

        const data: K8sLogs = {
          pod,
          container,
          namespace: namespace ?? "default",
          lines: parsedLines,
          truncated: parsedLines.length >= lines,
        };

        return dualOutput(
          data,
          (d) =>
            `${d.lines.length} line(s) from pod ${d.pod}:\n` +
            d.lines.map((l) => (l.timestamp ? `[${l.timestamp}] ${l.text}` : l.text)).join("\n")
        );
      } catch (e) {
        return handleRunError(e, "kubectl");
      }
    }
  );

  // -------------------------------------------------------------------------
  // k8s_exec
  // -------------------------------------------------------------------------
  server.tool(
    "k8s_exec",
    "Execute a command in a Kubernetes pod",
    {
      pod: z.string().describe("Pod name"),
      command: z.array(z.string()).describe("Command and arguments"),
      namespace: z.string().optional().describe("Namespace"),
      container: z.string().optional().describe("Container name"),
    },
    async ({ pod, command, namespace, container }) => {
      try {
        assertNoFlagInjection(pod, "pod");
        assertNoFlagInjectionList(command, "command");
        if (container) assertNoFlagInjection(container, "container");

        const args = ["exec", pod, ...nsArgs(namespace)];
        if (container) args.push("-c", container);
        args.push("--", ...command);

        const result = await run("kubectl", args);
        const output = (result.stdout + result.stderr).trim();
        const data: K8sExec = { output, exitCode: result.exitCode };

        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            output || "kubectl exec failed",
            "Ensure the pod is running and the command is valid",
            { exitCode: result.exitCode }
          );
        }

        return dualOutput(data, (d) => `Exit code: ${d.exitCode}\n${d.output}`);
      } catch (e) {
        return handleRunError(e, "kubectl");
      }
    }
  );

  // -------------------------------------------------------------------------
  // k8s_delete
  // -------------------------------------------------------------------------
  server.tool(
    "k8s_delete",
    "Delete a Kubernetes resource",
    {
      kind: z.string().describe("Resource kind"),
      name: z.string().describe("Resource name"),
      namespace: z.string().optional().describe("Namespace"),
    },
    async ({ kind, name, namespace }) => {
      try {
        assertNoFlagInjection(kind, "kind");
        assertNoFlagInjection(name, "name");

        const args = ["delete", kind, name, ...nsArgs(namespace)];
        const result = await run("kubectl", args);

        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "kubectl delete failed",
            "Check that the resource exists",
            { exitCode: result.exitCode }
          );
        }

        // Parse: "deployment.apps \"myapp\" deleted"
        const deleted: K8sDelete["deleted"] = [];
        for (const line of (result.stdout + result.stderr).split("\n")) {
          const m = line.match(/^([\w./-]+)\s+"([\w-]+)"\s+deleted/);
          if (m) {
            const kindRaw = m[1] ?? "";
            const shortKind = kindRaw.split(".")[0] ?? kindRaw;
            deleted.push({ kind: shortKind, name: m[2] ?? "" });
          }
        }

        if (deleted.length === 0) {
          deleted.push({ kind, name });
        }

        const data: K8sDelete = { deleted, count: deleted.length };
        return dualOutput(
          data,
          (d) => `Deleted ${d.count} resource(s):\n${d.deleted.map((r) => `  ${r.kind}/${r.name}`).join("\n")}`
        );
      } catch (e) {
        return handleRunError(e, "kubectl");
      }
    }
  );

  // -------------------------------------------------------------------------
  // k8s_rollout_status
  // -------------------------------------------------------------------------
  server.tool(
    "k8s_rollout_status",
    "Check rollout status for a Kubernetes deployment or daemonset",
    {
      kind: z.string().describe("Resource kind (deployment, daemonset, statefulset)"),
      name: z.string().describe("Resource name"),
      namespace: z.string().optional().describe("Namespace"),
    },
    async ({ kind, name, namespace }) => {
      try {
        assertNoFlagInjection(kind, "kind");
        assertNoFlagInjection(name, "name");

        const args = ["rollout", "status", `${kind}/${name}`, ...nsArgs(namespace)];
        const result = await run("kubectl", args);

        const message = (result.stdout + result.stderr).trim();
        const ready = result.exitCode === 0 && message.toLowerCase().includes("successfully rolled out");

        const data: K8sRollout = {
          name,
          kind,
          namespace: namespace ?? "default",
          ready,
          message,
        };

        if (result.exitCode !== 0 && !ready) {
          // Return data even on non-zero exit (rollout may be in progress)
          return dualOutput(data, (d) => `Rollout status for ${d.kind}/${d.name}: ${d.message}`);
        }

        return dualOutput(data, (d) => `Rollout status for ${d.kind}/${d.name}: ${d.message}`);
      } catch (e) {
        return handleRunError(e, "kubectl");
      }
    }
  );

  // -------------------------------------------------------------------------
  // k8s_get_contexts
  // -------------------------------------------------------------------------
  server.tool(
    "k8s_get_contexts",
    "List available kubectl contexts",
    {},
    async () => {
      try {
        const [currentResult, viewResult] = await Promise.all([
          run("kubectl", ["config", "current-context"]),
          run("kubectl", ["config", "view", "-o", "json"]),
        ]);

        const current = currentResult.stdout.trim();

        interface KubeConfig {
          contexts?: Array<{
            name: string;
            context?: {
              cluster?: string;
              user?: string;
            };
          }>;
        }

        const config = JSON.parse(viewResult.stdout) as KubeConfig;
        const rawContexts = config.contexts ?? [];

        const contexts: K8sContext["contexts"] = rawContexts.map((ctx) => ({
          name: ctx.name,
          cluster: ctx.context?.cluster ?? "",
          user: ctx.context?.user ?? "",
          current: ctx.name === current,
        }));

        const data: K8sContext = { current, contexts };
        return dualOutput(
          data,
          (d) =>
            `Current context: ${d.current}\nContexts:\n` +
            d.contexts.map((c) => `  ${c.current ? "* " : "  "}${c.name} (${c.cluster})`).join("\n")
        );
      } catch (e) {
        return handleRunError(e, "kubectl");
      }
    }
  );

  // -------------------------------------------------------------------------
  // k8s_use_context
  // -------------------------------------------------------------------------
  server.tool(
    "k8s_use_context",
    "Switch the active kubectl context",
    {
      context: z.string().describe("Context name to switch to"),
    },
    async ({ context }) => {
      try {
        assertNoFlagInjection(context, "context");

        const previousResult = await run("kubectl", ["config", "current-context"]);
        const previous = previousResult.stdout.trim();

        const result = await run("kubectl", ["config", "use-context", context]);
        const success = result.exitCode === 0;

        if (!success) {
          return makeError(
            "command-failed",
            result.stderr || "kubectl config use-context failed",
            "Check that the context exists (use k8s_get_contexts to list them)",
            { exitCode: result.exitCode }
          );
        }

        const data: K8sUseContext = { previous, current: context, success };
        return dualOutput(
          data,
          (d) => `Switched context from '${d.previous}' to '${d.current}'`
        );
      } catch (e) {
        return handleRunError(e, "kubectl");
      }
    }
  );
}
