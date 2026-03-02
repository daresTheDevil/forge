import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { run } from "../lib/runner.js";
import { dualOutput } from "../lib/output.js";
import {
  assertNoFlagInjection,
  assertNoFlagInjectionList,
} from "../lib/validation.js";
import { handleRunError, makeError } from "../lib/errors.js";
import type {
  GitStatus,
  GitLog,
  GitDiff,
  GitShow,
  GitAdd,
  GitCommitResult,
  GitPushResult,
  GitPullResult,
  GitBranch,
  GitCheckout,
} from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function repoOpts(repoPath?: string): { cwd: string } {
  return { cwd: repoPath ?? process.cwd() };
}

// ---------------------------------------------------------------------------
// git_status
// ---------------------------------------------------------------------------

function parseGitStatus(raw: string): GitStatus {
  const lines = raw.split("\n");

  let branch = "HEAD";
  let upstream: string | undefined;
  let ahead = 0;
  let behind = 0;

  const staged: GitStatus["staged"] = [];
  const modified: GitStatus["modified"] = [];
  const untracked: string[] = [];

  for (const line of lines) {
    if (line.startsWith("# branch.head ")) {
      branch = line.slice("# branch.head ".length).trim();
    } else if (line.startsWith("# branch.upstream ")) {
      upstream = line.slice("# branch.upstream ".length).trim();
    } else if (line.startsWith("# branch.ab ")) {
      const m = line.match(/\+(\d+)\s+-(\d+)/);
      if (m) {
        ahead = parseInt(m[1] ?? "0", 10);
        behind = parseInt(m[2] ?? "0", 10);
      }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      // format: "1 XY sub mH mI mW hH hI path"
      const parts = line.split(" ");
      const xy = parts[1] ?? "??";
      // For renamed (2 ...), path is last; handle "R" type
      const pathPart = line.startsWith("2 ")
        ? line.split("\t").pop() ?? ""
        : parts.slice(8).join(" ");

      const stagedStatus = xy[0] ?? " ";
      const unstagedStatus = xy[1] ?? " ";

      if (stagedStatus !== "." && stagedStatus !== " ") {
        staged.push({ path: pathPart, status: stagedStatus, staged: true });
      }
      if (unstagedStatus !== "." && unstagedStatus !== " ") {
        modified.push({
          path: pathPart,
          status: unstagedStatus,
          staged: false,
        });
      }
    } else if (line.startsWith("? ")) {
      untracked.push(line.slice(2).trim());
    }
  }

  const clean =
    staged.length === 0 &&
    modified.length === 0 &&
    untracked.length === 0;

  return { branch, upstream, ahead, behind, staged, modified, untracked, clean };
}

// ---------------------------------------------------------------------------
// git_diff parser
// ---------------------------------------------------------------------------

function parseGitDiff(raw: string): GitDiff {
  const files: GitDiff["files"] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  const fileBlocks = raw.split(/^diff --git /m).slice(1);

  for (const block of fileBlocks) {
    const lines = block.split("\n");
    let path = "";
    const pathMatch = lines[0]?.match(/b\/(.+)$/);
    if (pathMatch) path = pathMatch[1] ?? "";

    let additions = 0;
    let deletions = 0;

    for (const l of lines) {
      if (l.startsWith("+") && !l.startsWith("+++")) additions++;
      if (l.startsWith("-") && !l.startsWith("---")) deletions++;
    }

    totalAdditions += additions;
    totalDeletions += deletions;

    files.push({ path, additions, deletions, patch: block });
  }

  return { files, totalAdditions, totalDeletions };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function registerGitTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // git_status
  // -------------------------------------------------------------------------
  server.tool(
    "git_status",
    "Get the working tree status of a git repository",
    {
      repoPath: z.string().optional().describe("Path to the git repository (defaults to cwd)"),
    },
    async ({ repoPath }) => {
      try {
        const result = await run(
          "git",
          ["status", "--porcelain=v2", "--branch"],
          repoOpts(repoPath)
        );
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "git status failed",
            "Ensure the path is a valid git repository",
            { exitCode: result.exitCode }
          );
        }
        const data = parseGitStatus(result.stdout);
        return dualOutput(data, (d) => {
          const parts: string[] = [`Branch: ${d.branch}`];
          if (d.upstream) parts.push(`Upstream: ${d.upstream} (ahead ${d.ahead}, behind ${d.behind})`);
          if (d.staged.length) parts.push(`Staged: ${d.staged.map((f) => f.path).join(", ")}`);
          if (d.modified.length) parts.push(`Modified: ${d.modified.map((f) => f.path).join(", ")}`);
          if (d.untracked.length) parts.push(`Untracked: ${d.untracked.join(", ")}`);
          if (d.clean) parts.push("Working tree clean");
          return parts.join("\n");
        });
      } catch (e) {
        return handleRunError(e, "git");
      }
    }
  );

  // -------------------------------------------------------------------------
  // git_log
  // -------------------------------------------------------------------------
  server.tool(
    "git_log",
    "Get the commit history of a git repository",
    {
      repoPath: z.string().optional().describe("Path to the git repository"),
      limit: z.number().int().positive().default(20).describe("Maximum number of commits"),
      branch: z.string().optional().describe("Branch or ref to log"),
    },
    async ({ repoPath, limit, branch }) => {
      try {
        if (branch) assertNoFlagInjection(branch, "branch");

        const args = ["log"];
        if (branch) args.push(branch);
        args.push(
          "--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s",
          `--max-count=${limit}`
        );

        const result = await run("git", args, repoOpts(repoPath));
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "git log failed",
            "Ensure the repository and branch are valid",
            { exitCode: result.exitCode }
          );
        }

        const entries: GitLog = result.stdout
          .split("\n")
          .filter((l) => l.trim().length > 0)
          .map((l) => {
            const parts = l.split("\x00");
            return {
              hash: parts[0] ?? "",
              shortHash: parts[1] ?? "",
              author: parts[2] ?? "",
              email: parts[3] ?? "",
              date: parts[4] ?? "",
              message: parts[5] ?? "",
            };
          });

        return dualOutput(entries, (d) =>
          d.map((e) => `${e.shortHash} ${e.date.slice(0, 10)} ${e.author}: ${e.message}`).join("\n")
        );
      } catch (e) {
        return handleRunError(e, "git");
      }
    }
  );

  // -------------------------------------------------------------------------
  // git_diff
  // -------------------------------------------------------------------------
  server.tool(
    "git_diff",
    "Show staged or unstaged diff for a git repository",
    {
      repoPath: z.string().optional().describe("Path to the git repository"),
      staged: z.boolean().default(false).describe("Show staged diff (default: unstaged)"),
      file: z.string().optional().describe("Limit diff to a specific file"),
    },
    async ({ repoPath, staged, file }) => {
      try {
        if (file) assertNoFlagInjection(file, "file");

        const args = ["diff"];
        if (staged) args.push("--staged");
        if (file) args.push("--", file);

        const result = await run("git", args, repoOpts(repoPath));
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "git diff failed",
            "Ensure the repository is valid",
            { exitCode: result.exitCode }
          );
        }

        const data = parseGitDiff(result.stdout);
        return dualOutput(data, (d) =>
          `${d.files.length} file(s) changed: +${d.totalAdditions} -${d.totalDeletions}\n` +
          d.files.map((f) => `  ${f.path}: +${f.additions} -${f.deletions}`).join("\n")
        );
      } catch (e) {
        return handleRunError(e, "git");
      }
    }
  );

  // -------------------------------------------------------------------------
  // git_show
  // -------------------------------------------------------------------------
  server.tool(
    "git_show",
    "Show details of a specific commit",
    {
      repoPath: z.string().optional().describe("Path to the git repository"),
      hash: z.string().describe("Commit hash or ref to show"),
    },
    async ({ repoPath, hash }) => {
      try {
        assertNoFlagInjection(hash, "hash");

        const result = await run("git", ["show", hash], repoOpts(repoPath));
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "git show failed",
            "Ensure the commit hash is valid",
            { exitCode: result.exitCode }
          );
        }

        const lines = result.stdout.split("\n");
        let author = "";
        let email = "";
        let date = "";
        let message = "";
        let diffStart = 0;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";
          if (line.startsWith("Author:")) {
            const m = line.match(/Author:\s+(.+?)\s+<(.+)>/);
            author = m?.[1] ?? "";
            email = m?.[2] ?? "";
          } else if (line.startsWith("Date:")) {
            date = line.slice("Date:".length).trim();
          } else if (line.startsWith("    ") && message === "") {
            message = line.trim();
          } else if (line.startsWith("diff --git")) {
            diffStart = i;
            break;
          }
        }

        const diff = lines.slice(diffStart).join("\n");
        const data: GitShow = {
          hash,
          shortHash: hash.slice(0, 7),
          author,
          email,
          date,
          message,
          diff,
        };

        return dualOutput(
          data,
          (d) => `commit ${d.hash}\nAuthor: ${d.author} <${d.email}>\nDate: ${d.date}\n\n    ${d.message}`
        );
      } catch (e) {
        return handleRunError(e, "git");
      }
    }
  );

  // -------------------------------------------------------------------------
  // git_add
  // -------------------------------------------------------------------------
  server.tool(
    "git_add",
    "Stage files for commit",
    {
      repoPath: z.string().optional().describe("Path to the git repository"),
      paths: z.array(z.string()).default([]).describe("File paths to stage"),
      all: z.boolean().default(false).describe("Stage all changes (git add -A)"),
    },
    async ({ repoPath, paths, all }) => {
      try {
        assertNoFlagInjectionList(paths, "paths");

        const addArgs = all ? ["-A"] : [...paths];
        if (!all && paths.length === 0) {
          return makeError(
            "invalid-input",
            "Either specify paths or set all=true",
            "Provide at least one path or use all=true"
          );
        }

        const addResult = await run("git", ["add", ...addArgs], repoOpts(repoPath));
        if (addResult.exitCode !== 0) {
          return makeError(
            "command-failed",
            addResult.stderr || "git add failed",
            "Check that the file paths are valid",
            { exitCode: addResult.exitCode }
          );
        }

        const statusResult = await run(
          "git",
          ["status", "--porcelain"],
          repoOpts(repoPath)
        );

        const staged: string[] = statusResult.stdout
          .split("\n")
          .filter((l) => l.length >= 2 && l[0] !== " " && l[0] !== "?" && l[0] !== "!")
          .map((l) => l.slice(3).trim());

        const data: GitAdd = { staged, count: staged.length };
        return dualOutput(data, (d) => `Staged ${d.count} file(s):\n${d.staged.join("\n")}`);
      } catch (e) {
        return handleRunError(e, "git");
      }
    }
  );

  // -------------------------------------------------------------------------
  // git_commit
  // -------------------------------------------------------------------------
  server.tool(
    "git_commit",
    "Commit staged changes with a message",
    {
      repoPath: z.string().optional().describe("Path to the git repository"),
      message: z.string().describe("Commit message"),
    },
    async ({ repoPath, message }) => {
      try {
        const result = await run(
          "git",
          ["commit", "-m", message],
          repoOpts(repoPath)
        );

        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || result.stdout || "git commit failed",
            "Ensure there are staged changes and the message is non-empty",
            { exitCode: result.exitCode }
          );
        }

        // Parse "[branch abc1234] message\n N files changed"
        let hash = "";
        let branch = "";
        let filesChanged = 0;

        const branchHashMatch = result.stdout.match(/\[([^\s]+)\s+([a-f0-9]+)\]/);
        if (branchHashMatch) {
          branch = branchHashMatch[1] ?? "";
          hash = branchHashMatch[2] ?? "";
        }

        const filesMatch = result.stdout.match(/(\d+)\s+file/);
        if (filesMatch) {
          filesChanged = parseInt(filesMatch[1] ?? "0", 10);
        }

        const data: GitCommitResult = { hash, branch, message, filesChanged };
        return dualOutput(
          data,
          (d) => `[${d.branch} ${d.hash}] ${d.message}\n${d.filesChanged} file(s) changed`
        );
      } catch (e) {
        return handleRunError(e, "git");
      }
    }
  );

  // -------------------------------------------------------------------------
  // git_push
  // -------------------------------------------------------------------------
  server.tool(
    "git_push",
    "Push the current branch to a remote",
    {
      repoPath: z.string().optional().describe("Path to the git repository"),
      remote: z.string().default("origin").describe("Remote name (default: origin)"),
      branch: z.string().optional().describe("Branch to push"),
    },
    async ({ repoPath, remote, branch }) => {
      try {
        assertNoFlagInjection(remote, "remote");
        if (branch) assertNoFlagInjection(branch, "branch");

        const args = ["push", remote];
        if (branch) args.push(branch);

        const result = await run("git", args, repoOpts(repoPath));
        const success = result.exitCode === 0;
        const message = (success ? result.stderr || result.stdout : result.stderr || result.stdout).trim();

        const data: GitPushResult = {
          remote,
          branch: branch ?? "",
          success,
          message,
        };

        if (!success) {
          return makeError(
            "command-failed",
            message || "git push failed",
            "Check remote connectivity and branch permissions",
            { exitCode: result.exitCode }
          );
        }

        return dualOutput(data, (d) => `Pushed to ${d.remote}${d.branch ? `/${d.branch}` : ""}\n${d.message}`);
      } catch (e) {
        return handleRunError(e, "git");
      }
    }
  );

  // -------------------------------------------------------------------------
  // git_pull
  // -------------------------------------------------------------------------
  server.tool(
    "git_pull",
    "Pull from a remote repository",
    {
      repoPath: z.string().optional().describe("Path to the git repository"),
      remote: z.string().default("origin").describe("Remote name (default: origin)"),
    },
    async ({ repoPath, remote }) => {
      try {
        assertNoFlagInjection(remote, "remote");

        // Get current branch name
        const branchResult = await run(
          "git",
          ["rev-parse", "--abbrev-ref", "HEAD"],
          repoOpts(repoPath)
        );
        const branch = branchResult.stdout.trim();

        const result = await run("git", ["pull", remote], repoOpts(repoPath));
        const success = result.exitCode === 0;
        const message = (result.stdout || result.stderr).trim();

        let filesChanged = 0;
        const filesMatch = message.match(/(\d+)\s+file/);
        if (filesMatch) filesChanged = parseInt(filesMatch[1] ?? "0", 10);

        if (!success) {
          return makeError(
            "command-failed",
            result.stderr || "git pull failed",
            "Check remote connectivity and resolve any conflicts",
            { exitCode: result.exitCode }
          );
        }

        const data: GitPullResult = { success, message, filesChanged, branch };
        return dualOutput(data, (d) => `Pulled from ${remote} on branch ${d.branch}\n${d.message}`);
      } catch (e) {
        return handleRunError(e, "git");
      }
    }
  );

  // -------------------------------------------------------------------------
  // git_branch
  // -------------------------------------------------------------------------
  server.tool(
    "git_branch",
    "List git branches with tracking status",
    {
      repoPath: z.string().optional().describe("Path to the git repository"),
      all: z.boolean().default(false).describe("Include remote-tracking branches"),
    },
    async ({ repoPath, all }) => {
      try {
        const args = [
          "branch",
          "-vv",
          "--format=%(refname:short)%09%(HEAD)%09%(upstream:short)%09%(objectname:short)%09%(contents:subject)",
        ];
        if (all) args.push("--all");

        const result = await run("git", args, repoOpts(repoPath));
        if (result.exitCode !== 0) {
          return makeError(
            "command-failed",
            result.stderr || "git branch failed",
            "Ensure the repository is valid",
            { exitCode: result.exitCode }
          );
        }

        let current = "";
        const branches: GitBranch["branches"] = result.stdout
          .split("\n")
          .filter((l) => l.trim().length > 0)
          .map((l) => {
            const parts = l.split("\t");
            const name = parts[0] ?? "";
            const isCurrent = parts[1] === "*";
            const upstream = parts[2] && parts[2].length > 0 ? parts[2] : undefined;
            const lastCommit = parts[4] ?? undefined;

            if (isCurrent) current = name;

            return {
              name,
              current: isCurrent,
              upstream,
              lastCommit,
            };
          });

        const data: GitBranch = { branches, current };
        return dualOutput(data, (d) =>
          d.branches
            .map((b) => `${b.current ? "* " : "  "}${b.name}${b.upstream ? ` -> ${b.upstream}` : ""}`)
            .join("\n")
        );
      } catch (e) {
        return handleRunError(e, "git");
      }
    }
  );

  // -------------------------------------------------------------------------
  // git_checkout
  // -------------------------------------------------------------------------
  server.tool(
    "git_checkout",
    "Switch branches or restore working tree files",
    {
      repoPath: z.string().optional().describe("Path to the git repository"),
      branch: z.string().describe("Branch name to checkout or create"),
      create: z.boolean().default(false).describe("Create the branch if it does not exist"),
      file: z.string().optional().describe("Restore a specific file from the branch"),
    },
    async ({ repoPath, branch, create, file }) => {
      try {
        assertNoFlagInjection(branch, "branch");
        if (file) assertNoFlagInjection(file, "file");

        let args: string[];
        if (create) {
          args = ["checkout", "-b", branch];
        } else if (file) {
          args = ["checkout", branch, "--", file];
        } else {
          args = ["checkout", branch];
        }

        const result = await run("git", args, repoOpts(repoPath));
        const success = result.exitCode === 0;
        const message = (result.stderr || result.stdout).trim();

        if (!success) {
          return makeError(
            "command-failed",
            message || "git checkout failed",
            create
              ? "Branch may already exist or there are uncommitted changes"
              : "Branch may not exist or there are uncommitted changes",
            { exitCode: result.exitCode }
          );
        }

        const data: GitCheckout = { branch, created: create, message };
        return dualOutput(data, (d) =>
          `${d.created ? "Created and switched to" : "Switched to"} branch '${d.branch}'\n${d.message}`
        );
      } catch (e) {
        return handleRunError(e, "git");
      }
    }
  );
}
