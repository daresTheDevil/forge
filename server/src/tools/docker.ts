import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { run } from "../lib/runner.js";
import { dualOutput } from "../lib/output.js";
import { assertNoFlagInjection, assertNoFlagInjectionList } from "../lib/validation.js";
import { handleRunError, makeError } from "../lib/errors.js";
import type {
  DockerPs,
  DockerBuild,
  DockerRun,
  DockerLogs,
  DockerStop,
  DockerImages,
  DockerExec,
  DockerComposeUp,
  DockerComposeDown,
} from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DockerPsRaw {
  ID?: string;
  Names?: string;
  Image?: string;
  Status?: string;
  State?: string;
  Ports?: string;
  CreatedAt?: string;
  [key: string]: string | undefined;
}

function parseDockerJsonLines<T>(stdout: string): T[] {
  return stdout
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => JSON.parse(l) as T);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function registerDockerTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // docker_ps
  // -------------------------------------------------------------------------
  server.tool(
    "docker_ps",
    "List running (or all) containers",
    {
      all: z.boolean().default(false).describe("Include stopped containers"),
    },
    async ({ all }) => {
      try {
        const args = ["ps", "--format", "{{json .}}"];
        if (all) args.splice(1, 0, "--all");

        const result = await run("docker", args);
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "docker ps failed",
            "Ensure Docker is running",
            { exitCode: result.exitCode }
          );
        }

        const raw = parseDockerJsonLines<DockerPsRaw>(result.stdout);
        const containers: DockerPs["containers"] = raw.map((c) => ({
          id: c.ID ?? c["Id"] ?? "",
          name: (c.Names ?? "").replace(/^\//, ""),
          image: c.Image ?? "",
          status: c.Status ?? "",
          state: c.State ?? "",
          ports: (c.Ports ?? "")
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p.length > 0),
          created: c.CreatedAt ?? "",
        }));

        const running = containers.filter((c) =>
          c.state.toLowerCase() === "running"
        ).length;

        const data: DockerPs = { containers, total: containers.length, running };
        return dualOutput(data, (d) =>
          `${d.running}/${d.total} containers running\n` +
          d.containers.map((c) => `  ${c.name} (${c.image}) — ${c.status}`).join("\n")
        );
      } catch (e) {
        return handleRunError(e, "docker");
      }
    }
  );

  // -------------------------------------------------------------------------
  // docker_build
  // -------------------------------------------------------------------------
  server.tool(
    "docker_build",
    "Build a Docker image from a context path",
    {
      contextPath: z.string().describe("Build context path"),
      tag: z.string().optional().describe("Image tag (e.g. myapp:latest)"),
      dockerfile: z.string().optional().describe("Path to Dockerfile"),
      timeoutMs: z.number().default(300_000).describe("Build timeout in milliseconds"),
    },
    async ({ contextPath, tag, dockerfile, timeoutMs }) => {
      try {
        assertNoFlagInjection(contextPath, "contextPath");

        const args = ["build"];
        if (tag) args.push("-t", tag);
        if (dockerfile) args.push("-f", dockerfile);
        args.push(contextPath);

        const start = Date.now();
        const result = await run("docker", args, { timeoutMs });
        const durationMs = Date.now() - start;

        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "docker build failed",
            "Check the Dockerfile and build context for errors",
            { exitCode: result.exitCode }
          );
        }

        // Parse image ID from output
        const combined = result.stdout + result.stderr;
        let imageId = "";
        const successMatch = combined.match(/Successfully built ([a-f0-9]+)/);
        if (successMatch) {
          imageId = successMatch[1] ?? "";
        } else {
          // BuildKit output: sha256:...
          const sha256Match = combined.match(/sha256:([a-f0-9]{12,64})/g);
          if (sha256Match) {
            imageId = sha256Match[sha256Match.length - 1] ?? "";
          }
        }

        const sizeMatch = combined.match(/SIZE\s+([\d.]+\s*\w+)/);

        const data: DockerBuild = {
          imageId,
          tag,
          size: sizeMatch ? sizeMatch[1] : undefined,
          durationMs,
        };

        return dualOutput(
          data,
          (d) => `Built ${d.tag ?? d.imageId} in ${(d.durationMs / 1000).toFixed(1)}s`
        );
      } catch (e) {
        return handleRunError(e, "docker");
      }
    }
  );

  // -------------------------------------------------------------------------
  // docker_run
  // -------------------------------------------------------------------------
  server.tool(
    "docker_run",
    "Run a Docker container",
    {
      image: z.string().describe("Image name to run"),
      name: z.string().optional().describe("Container name"),
      ports: z.array(z.string()).optional().describe("Port mappings (e.g. [\"8080:80\"])"),
      env: z.record(z.string()).optional().describe("Environment variables"),
      detach: z.boolean().default(true).describe("Run in detached mode"),
    },
    async ({ image, name, ports, env, detach }) => {
      try {
        assertNoFlagInjection(image, "image");

        const args = ["run"];
        if (detach) args.push("-d");
        if (name) args.push("--name", name);
        for (const port of ports ?? []) args.push("-p", port);
        for (const [key, val] of Object.entries(env ?? {})) {
          args.push("-e", `${key}=${val}`);
        }
        args.push(image);

        const result = await run("docker", args);
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "docker run failed",
            "Check the image name and port availability",
            { exitCode: result.exitCode }
          );
        }

        const containerId = result.stdout.trim().slice(0, 12);
        const data: DockerRun = {
          containerId,
          name: name ?? containerId,
          image,
          status: detach ? "running" : "exited",
        };

        return dualOutput(data, (d) => `Started container ${d.name} (${d.containerId}) from ${d.image}`);
      } catch (e) {
        return handleRunError(e, "docker");
      }
    }
  );

  // -------------------------------------------------------------------------
  // docker_logs
  // -------------------------------------------------------------------------
  server.tool(
    "docker_logs",
    "Fetch logs from a container",
    {
      container: z.string().describe("Container name or ID"),
      lines: z.number().default(100).describe("Number of lines to fetch"),
      timestamps: z.boolean().default(true).describe("Include timestamps"),
    },
    async ({ container, lines, timestamps }) => {
      try {
        assertNoFlagInjection(container, "container");

        const args = ["logs", "--tail", String(lines)];
        if (timestamps) args.push("--timestamps");
        args.push(container);

        const result = await run("docker", args);
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "docker logs failed",
            "Ensure the container exists and is accessible",
            { exitCode: result.exitCode }
          );
        }

        // Docker logs mixes stdout and stderr; combine both
        const allLines = [...result.stdout.split("\n"), ...result.stderr.split("\n")].filter(
          (l) => l.trim().length > 0
        );

        const parsed: DockerLogs["lines"] = allLines.map((l) => {
          // Timestamp prefix looks like "2024-01-01T00:00:00.000000000Z "
          const tsMatch = l.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)$/);
          if (tsMatch) {
            return {
              timestamp: tsMatch[1],
              stream: "stdout" as const,
              text: tsMatch[2] ?? "",
            };
          }
          return { stream: "stdout" as const, text: l };
        });

        const data: DockerLogs = {
          containerId: container,
          lines: parsed,
          truncated: parsed.length >= lines,
        };

        return dualOutput(
          data,
          (d) =>
            `${d.lines.length} log line(s) from ${d.containerId}:\n` +
            d.lines.map((l) => (l.timestamp ? `[${l.timestamp}] ${l.text}` : l.text)).join("\n")
        );
      } catch (e) {
        return handleRunError(e, "docker");
      }
    }
  );

  // -------------------------------------------------------------------------
  // docker_exec
  // -------------------------------------------------------------------------
  server.tool(
    "docker_exec",
    "Execute a command in a running container",
    {
      container: z.string().describe("Container name or ID"),
      command: z.array(z.string()).describe("Command and arguments to execute"),
    },
    async ({ container, command }) => {
      try {
        assertNoFlagInjection(container, "container");
        assertNoFlagInjectionList(command, "command");

        const result = await run("docker", ["exec", container, ...command]);

        const output = (result.stdout + result.stderr).trim();
        const data: DockerExec = { output, exitCode: result.exitCode };

        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            output || "docker exec failed",
            "Ensure the container is running and the command is valid",
            { exitCode: result.exitCode }
          );
        }

        return dualOutput(data, (d) => `Exit code: ${d.exitCode}\n${d.output}`);
      } catch (e) {
        return handleRunError(e, "docker");
      }
    }
  );

  // -------------------------------------------------------------------------
  // docker_stop
  // -------------------------------------------------------------------------
  server.tool(
    "docker_stop",
    "Stop a running container",
    {
      container: z.string().describe("Container name or ID"),
    },
    async ({ container }) => {
      try {
        assertNoFlagInjection(container, "container");

        const result = await run("docker", ["stop", container]);
        const stopped = result.exitCode === 0;

        if (!stopped) {
          return makeError(
            "command-failed",
            result.stderr || "docker stop failed",
            "Ensure the container exists and is running",
            { exitCode: result.exitCode }
          );
        }

        const data: DockerStop = {
          containerId: result.stdout.trim(),
          name: container,
          stopped,
        };

        return dualOutput(data, (d) => `Stopped container ${d.name}`);
      } catch (e) {
        return handleRunError(e, "docker");
      }
    }
  );

  // -------------------------------------------------------------------------
  // docker_images
  // -------------------------------------------------------------------------
  server.tool(
    "docker_images",
    "List Docker images",
    {
      repository: z.string().optional().describe("Filter by repository name"),
    },
    async ({ repository }) => {
      try {
        const args = ["images", "--format", "{{json .}}"];
        if (repository) {
          assertNoFlagInjection(repository, "repository");
          args.splice(1, 0, repository);
        }

        const result = await run("docker", args);
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "docker images failed",
            "Ensure Docker is running",
            { exitCode: result.exitCode }
          );
        }

        interface DockerImageRaw {
          ID?: string;
          Repository?: string;
          Tag?: string;
          Size?: string;
          CreatedAt?: string;
          [key: string]: string | undefined;
        }

        const raw = parseDockerJsonLines<DockerImageRaw>(result.stdout);
        const data: DockerImages = raw.map((img) => ({
          id: img.ID ?? "",
          repository: img.Repository ?? "",
          tag: img.Tag ?? "",
          size: img.Size ?? "",
          created: img.CreatedAt ?? "",
        }));

        return dualOutput(data, (d) =>
          d.map((img) => `${img.repository}:${img.tag} (${img.id}) ${img.size}`).join("\n")
        );
      } catch (e) {
        return handleRunError(e, "docker");
      }
    }
  );

  // -------------------------------------------------------------------------
  // docker_compose_up
  // -------------------------------------------------------------------------
  server.tool(
    "docker_compose_up",
    "Start services with docker compose",
    {
      file: z.string().optional().describe("Path to docker-compose file"),
      services: z.array(z.string()).optional().describe("Specific services to start"),
      detach: z.boolean().default(true).describe("Run in detached mode"),
    },
    async ({ file, services, detach }) => {
      try {
        const args = ["compose"];
        if (file) args.push("-f", file);
        args.push("up");
        if (detach) args.push("-d");
        if (services && services.length > 0) {
          assertNoFlagInjectionList(services, "services");
          args.push(...services);
        }

        const result = await run("docker", args);
        const success = result.exitCode === 0;

        if (!success) {
          return makeError(
            "command-failed",
            result.stderr || "docker compose up failed",
            "Check your docker-compose file and service definitions",
            { exitCode: result.exitCode }
          );
        }

        // Parse started services from output
        const combined = result.stdout + result.stderr;
        const serviceNames = new Set<string>();
        const startedMatch = combined.matchAll(/Container\s+(\S+)\s+(?:Started|Running|Created)/g);
        for (const m of startedMatch) {
          if (m[1]) serviceNames.add(m[1]);
        }

        const parsedServices: DockerComposeUp["services"] = Array.from(serviceNames).map((name) => ({
          name,
          status: "running",
        }));

        const data: DockerComposeUp = {
          services: parsedServices,
          action: "up",
          success,
        };

        return dualOutput(
          data,
          (d) => `docker compose up: ${d.services.length} service(s) started\n${d.services.map((s) => `  ${s.name}`).join("\n")}`
        );
      } catch (e) {
        return handleRunError(e, "docker");
      }
    }
  );

  // -------------------------------------------------------------------------
  // docker_compose_down
  // -------------------------------------------------------------------------
  server.tool(
    "docker_compose_down",
    "Stop and remove services with docker compose",
    {
      file: z.string().optional().describe("Path to docker-compose file"),
      volumes: z.boolean().default(false).describe("Remove named volumes"),
    },
    async ({ file, volumes }) => {
      try {
        const args = ["compose"];
        if (file) args.push("-f", file);
        args.push("down");
        if (volumes) args.push("--volumes");

        const result = await run("docker", args);
        const success = result.exitCode === 0;

        if (!success) {
          return makeError(
            "command-failed",
            result.stderr || "docker compose down failed",
            "Check that docker compose services are running",
            { exitCode: result.exitCode }
          );
        }

        const combined = result.stdout + result.stderr;
        const serviceNames = new Set<string>();
        const stoppedMatch = combined.matchAll(/Container\s+(\S+)\s+(?:Stopped|Removed)/g);
        for (const m of stoppedMatch) {
          if (m[1]) serviceNames.add(m[1]);
        }

        const parsedServices: DockerComposeDown["services"] = Array.from(serviceNames).map((name) => ({
          name,
        }));

        const data: DockerComposeDown = {
          services: parsedServices,
          action: "down",
          success,
        };

        return dualOutput(
          data,
          (d) =>
            `docker compose down: ${d.services.length} service(s) removed\n${d.services.map((s) => `  ${s.name}`).join("\n")}`
        );
      } catch (e) {
        return handleRunError(e, "docker");
      }
    }
  );
}
