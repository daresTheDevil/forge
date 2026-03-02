import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { run } from "../lib/runner.js";
import { dualOutput } from "../lib/output.js";
import { assertNoFlagInjection, assertNoFlagInjectionList } from "../lib/validation.js";
import { handleRunError, makeError } from "../lib/errors.js";
import type {
  PnpmInstall,
  PnpmAdd,
  PnpmRemove,
  PnpmRun,
  PnpmList,
} from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cwdOpts(cwd?: string): { cwd: string } {
  return { cwd: cwd ?? process.cwd() };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function registerPnpmTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // pnpm_install
  // -------------------------------------------------------------------------
  server.tool(
    "pnpm_install",
    "Install project dependencies with pnpm",
    {
      cwd: z.string().optional().describe("Working directory (defaults to cwd)"),
      frozen: z.boolean().default(false).describe("Use --frozen-lockfile (CI mode)"),
    },
    async ({ cwd, frozen }) => {
      try {
        const args = ["install"];
        if (frozen) args.push("--frozen-lockfile");

        const start = Date.now();
        const result = await run("pnpm", args, cwdOpts(cwd));
        const durationMs = Date.now() - start;

        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "pnpm install failed",
            "Check package.json and pnpm-lock.yaml for errors",
            { exitCode: result.exitCode }
          );
        }

        const combined = result.stdout + result.stderr;

        let packagesInstalled = 0;
        let packagesUpdated = 0;

        // Parse "Packages: +5 -2" or "Already up to date"
        const pkgMatch = combined.match(/Packages:\s*(?:\+(\d+))?\s*(?:-(\d+))?/);
        if (pkgMatch) {
          packagesInstalled = parseInt(pkgMatch[1] ?? "0", 10);
          packagesUpdated = parseInt(pkgMatch[2] ?? "0", 10);
        }

        const lockfileUpdated = combined.includes("lockfile updated") ||
          combined.includes("Lockfile updated");

        const data: PnpmInstall = {
          packagesInstalled,
          packagesUpdated,
          durationMs,
          lockfileUpdated,
        };

        return dualOutput(
          data,
          (d) =>
            `pnpm install completed in ${(d.durationMs / 1000).toFixed(1)}s\n` +
            `+${d.packagesInstalled} installed, ${d.packagesUpdated} updated`
        );
      } catch (e) {
        return handleRunError(e, "pnpm");
      }
    }
  );

  // -------------------------------------------------------------------------
  // pnpm_add
  // -------------------------------------------------------------------------
  server.tool(
    "pnpm_add",
    "Add packages with pnpm",
    {
      packages: z.array(z.string()).describe("Package names to add (e.g. [\"lodash\", \"zod@^3\"])"),
      dev: z.boolean().default(false).describe("Add as devDependency"),
      cwd: z.string().optional().describe("Working directory"),
    },
    async ({ packages, dev, cwd }) => {
      try {
        assertNoFlagInjectionList(packages, "packages");

        if (packages.length === 0) {
          return makeError(
            "invalid-input",
            "At least one package name is required",
            "Provide package names in the packages array"
          );
        }

        const args = ["add", ...packages];
        if (dev) args.push("-D");

        const result = await run("pnpm", args, cwdOpts(cwd));
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "pnpm add failed",
            "Check package names and registry connectivity",
            { exitCode: result.exitCode }
          );
        }

        const combined = result.stdout + result.stderr;
        const pkgType: "dependency" | "devDependency" = dev ? "devDependency" : "dependency";

        // Parse added packages from output lines like "+ package@version"
        const added: PnpmAdd["added"] = [];
        const addedMatch = combined.matchAll(/\+\s+([\w@/.~-]+)(?:\s+([\d.]+))?/g);
        for (const m of addedMatch) {
          const raw = m[1] ?? "";
          // Handle scoped packages: @org/name@version
          const versionSep = raw.lastIndexOf("@");
          let name = raw;
          let version = m[2] ?? "latest";
          if (versionSep > 0) {
            name = raw.slice(0, versionSep);
            version = raw.slice(versionSep + 1);
          }
          added.push({ name, version, type: pkgType });
        }

        // Fallback: at least report what was requested
        if (added.length === 0) {
          for (const pkg of packages) {
            added.push({ name: pkg, version: "unknown", type: pkgType });
          }
        }

        const data: PnpmAdd = { added };
        return dualOutput(
          data,
          (d) =>
            `Added ${d.added.length} package(s):\n` +
            d.added.map((p) => `  ${p.name}@${p.version} (${p.type})`).join("\n")
        );
      } catch (e) {
        return handleRunError(e, "pnpm");
      }
    }
  );

  // -------------------------------------------------------------------------
  // pnpm_remove
  // -------------------------------------------------------------------------
  server.tool(
    "pnpm_remove",
    "Remove packages with pnpm",
    {
      packages: z.array(z.string()).describe("Package names to remove"),
      cwd: z.string().optional().describe("Working directory"),
    },
    async ({ packages, cwd }) => {
      try {
        assertNoFlagInjectionList(packages, "packages");

        if (packages.length === 0) {
          return makeError(
            "invalid-input",
            "At least one package name is required",
            "Provide package names in the packages array"
          );
        }

        const result = await run("pnpm", ["remove", ...packages], cwdOpts(cwd));
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "pnpm remove failed",
            "Check that the packages are installed",
            { exitCode: result.exitCode }
          );
        }

        const data: PnpmRemove = { removed: packages, count: packages.length };
        return dualOutput(
          data,
          (d) => `Removed ${d.count} package(s):\n${d.removed.join(", ")}`
        );
      } catch (e) {
        return handleRunError(e, "pnpm");
      }
    }
  );

  // -------------------------------------------------------------------------
  // pnpm_run
  // -------------------------------------------------------------------------
  server.tool(
    "pnpm_run",
    "Run a script from package.json with pnpm",
    {
      script: z.string().describe("Script name to run"),
      cwd: z.string().optional().describe("Working directory"),
      args: z.array(z.string()).optional().describe("Additional arguments passed after --"),
    },
    async ({ script, cwd, args }) => {
      try {
        assertNoFlagInjection(script, "script");

        const runArgs = ["run", script];
        if (args && args.length > 0) {
          runArgs.push("--", ...args);
        }

        const start = Date.now();
        const result = await run("pnpm", runArgs, cwdOpts(cwd));
        const durationMs = Date.now() - start;

        const output = (result.stdout + result.stderr).trim();
        const success = result.exitCode === 0;

        const data: PnpmRun = {
          script,
          exitCode: result.exitCode,
          success,
          output,
          durationMs,
        };

        if (!success) {
          return makeError(
            "command-failed",
            `Script '${script}' exited with code ${result.exitCode}`,
            "Check the script definition in package.json and the error output",
            { exitCode: result.exitCode }
          );
        }

        return dualOutput(
          data,
          (d) =>
            `pnpm run ${d.script} exited ${d.exitCode} in ${(d.durationMs / 1000).toFixed(1)}s\n${d.output}`
        );
      } catch (e) {
        return handleRunError(e, "pnpm");
      }
    }
  );

  // -------------------------------------------------------------------------
  // pnpm_list
  // -------------------------------------------------------------------------
  server.tool(
    "pnpm_list",
    "List installed packages",
    {
      cwd: z.string().optional().describe("Working directory"),
      depth: z.number().int().min(0).default(0).describe("Dependency depth (0 = direct only)"),
    },
    async ({ cwd, depth }) => {
      try {
        const args = ["list", "--json", `--depth=${depth}`];
        const result = await run("pnpm", args, cwdOpts(cwd));

        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "pnpm list failed",
            "Ensure pnpm install has been run",
            { exitCode: result.exitCode }
          );
        }

        interface PnpmListEntry {
          name?: string;
          version?: string;
          [key: string]: unknown;
        }

        interface PnpmListOutput {
          dependencies?: Record<string, PnpmListEntry>;
          devDependencies?: Record<string, PnpmListEntry>;
        }

        // pnpm list --json returns an array of workspace objects
        const raw = JSON.parse(result.stdout) as PnpmListOutput[] | PnpmListOutput;
        const first = Array.isArray(raw) ? raw[0] ?? {} : raw;

        const packages: PnpmList["packages"] = [];

        for (const [name, info] of Object.entries(first.dependencies ?? {})) {
          packages.push({
            name,
            version: typeof info === "object" && info !== null && "version" in info
              ? String((info as PnpmListEntry).version ?? "")
              : "",
            type: "dependency",
          });
        }

        for (const [name, info] of Object.entries(first.devDependencies ?? {})) {
          packages.push({
            name,
            version: typeof info === "object" && info !== null && "version" in info
              ? String((info as PnpmListEntry).version ?? "")
              : "",
            type: "devDependency",
          });
        }

        const data: PnpmList = { packages, total: packages.length };
        return dualOutput(
          data,
          (d) =>
            `${d.total} package(s):\n` +
            d.packages
              .map((p) => `  ${p.name}@${p.version} (${p.type})`)
              .join("\n")
        );
      } catch (e) {
        return handleRunError(e, "pnpm");
      }
    }
  );
}
