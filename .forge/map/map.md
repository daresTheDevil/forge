# Forge — Project Map

**Generated**: 2026-03-02T22:00:00Z

## Identity

- **Name**: forge (package: `forge` / `@forge/tools`)
- **Version**: 0.1.1 (root), 0.1.0 (MCP server)
- **Purpose**: Personal AI development workflow for Claude Code — autonomous build loop, NIGC compliance layer, MCP tools server, and slash command system
- **One-liner**: CLI + MCP server that provides structured AI-driven dev workflows (build, review, release, diagnose, improve) with compliance gates for regulated environments

## Top-Level Directory Structure

```
forge/
├── agents/              9 subagent prompt files (.md) — spawned by workflows
├── commands/forge/      25 slash command stubs — thin @-include wrappers
├── server/              MCP tools server (TypeScript, compiled to dist/)
│   ├── src/
│   │   ├── cli/         Standalone CLI entry: build loop + improve loop
│   │   ├── lib/         Shared: runner, output, errors, validation
│   │   ├── schemas/     Zod response schemas for all tool outputs
│   │   └── tools/       5 MCP tool modules: git, docker, k8s, pnpm, compliance
│   └── dist/            Compiled JS (gitignored, rebuilt on install)
├── workflows/forge/     25 workflow definition files — actual command logic
├── templates/.forge/    Project init templates (config, compliance structure)
├── .forge/              Runtime state for this repo (plans, specs, compliance)
├── install.sh           Primary installer (builds server, copies assets, wires MCP)
├── update.sh            Pull + rebuild
├── uninstall.sh         Removes all installed assets
├── package.json         Root monorepo descriptor (delegates to server via pnpm --filter)
└── tsconfig.base.json   Shared TypeScript compiler config
```

## Entry Points

| Entry Point | Path | Purpose |
|---|---|---|
| Installer | `install.sh` | Builds server, installs commands/agents/workflows, wires MCP config |
| CLI dispatcher | `~/.local/bin/forge` (post-install) | Shell entry: `forge build`, `forge improve`, `forge update`, `forge uninstall` |
| CLI main | `server/src/cli/index.ts` | Arg parser + router; compiled to `dist/cli/index.js` |
| MCP server | `server/src/index.ts` | stdio MCP server; compiled to `dist/index.js` |
| Update script | `update.sh` | `git pull` + rebuild + reinstall |
| Uninstall | `uninstall.sh` | Removes `~/.claude/commands/forge/`, agents, workflows, MCP entry |

## Key Files

| File | Description |
|---|---|
| `package.json` | Root; version 0.1.1; delegates build/test/lint to `server/` via pnpm filter |
| `server/package.json` | `@forge/tools` v0.1.0; ESM, main = `./dist/index.js` |
| `server/src/index.ts` | MCP server bootstrap — registers all tools, connects stdio transport |
| `server/src/tools/index.ts` | Aggregates 5 tool modules: git (10), docker (9), k8s (9), pnpm (5), compliance (6) = 39 tools total |
| `server/src/cli/index.ts` | CLI router: `build` → `runBuild()`, `improve` → `runImproveCommand()` |
| `server/src/cli/build.ts` | Autonomous build loop — wave-ordered plan execution, TUI, blocker detection |
| `server/src/cli/improve.ts` | Improve loop — iterative quality pass on modified files |
| `server/src/cli/types.ts` | Shared types: PlanFile, BuildState, TaskState, SpawnEvent, ImproveOptions |
| `server/src/lib/runner.ts` | `run()` — async child process spawner with timeout + output cap (10 MB) |
| `server/src/lib/output.ts` | `dualOutput()` — produces structuredContent (JSON) + human text simultaneously |
| `server/src/lib/errors.ts` | `makeError()` — typed error with category + suggestion |
| `server/src/lib/validation.ts` | `assertNoFlagInjection()` — guards all user string inputs |
| `server/src/schemas/index.ts` | Zod schemas for all MCP tool response types |
| `tsconfig.base.json` | Strict TS: ES2022, Node16 modules, strict + noUncheckedIndexedAccess |
| `.forge/config.json` | Per-project forge config: gates, compliance settings, concurrency |
| `install.sh` | Full installer — 258 lines, handles build, asset copy, MCP config merge |

## Slash Commands (25)

`audit` `build` `continue` `diagnose` `discuss` `docs` `drift` `evolve` `fire` `handoff` `health` `help` `improve` `learn` `map` `plan` `promote` `quick` `recon` `release` `review` `secure` `settings` `spec` `status`

## Agents (9)

`forge-debugger` `forge-executor` `forge-improver` `forge-mapper` `forge-plan-checker` `forge-planner` `forge-researcher` `forge-reviewer` `forge-security`

## Workflows (25)

Mirrors the command list — one workflow per command, full logic in markdown.
