# Forge — Technology Stack

**Generated**: 2026-03-02T22:00:00Z

## Runtimes

| Runtime | Version | Notes |
|---|---|---|
| Node.js | >= 20 (found v25.6.1) | Required for MCP server + CLI; enforced in `install.sh` |
| TypeScript | ^5.5.0 | Compiled to ESM (Node16 module resolution) |
| Target | ES2022 | `tsconfig.base.json` |
| Module format | ESM (`"type": "module"`) | `server/package.json` |

## Bundler / Build

- **Compiler**: `tsc` (plain TypeScript compiler, no bundler)
- **Build command**: `pnpm --silent build` → `tsc` in `server/`
- **Output**: `server/dist/` — flat JS with `.js` extensions and source maps
- **Watch mode**: `pnpm dev` → `tsc --watch`

## Package Manager

- **Root**: `pnpm` workspaces (flat filter, not true workspace — `pnpm --filter ./server`)
- **Root package**: `forge` v0.1.1 — no direct runtime deps, delegates to server
- **Server package**: `@forge/tools` v0.1.0

## Runtime Dependencies (`server/package.json`)

| Package | Version | Purpose |
|---|---|---|
| `@modelcontextprotocol/sdk` | ^1.0.0 | MCP server, stdio transport, tool registration |
| `zod` | ^3.23.0 | Schema validation for all tool inputs and outputs |
| `chalk` | ^5.6.2 | Terminal color output in CLI TUI |
| `strip-ansi` | ^7.1.0 | Strip ANSI from subprocess stdout/stderr before parsing |
| `which` | ^4.0.0 | Resolve CLI tool paths before spawning (command-not-found detection) |

## Dev Dependencies (`server/package.json`)

| Package | Version | Purpose |
|---|---|---|
| `typescript` | ^5.5.0 | TypeScript compiler |
| `vitest` | ^2.0.0 | Unit test runner |
| `@types/node` | ^20.0.0 | Node.js type definitions |
| `@types/which` | ^3.0.0 | Type definitions for `which` |

## Test Runner

- **Vitest** v2 — `pnpm test` → `vitest run`
- Test files co-located with source: `*.test.ts` in `server/src/cli/`
- Tests exist for: `build.test.ts`, `improve.test.ts`, `index.test.ts`, `parser.test.ts`, `spawn.test.ts`, `tui.test.ts`

## Linter / Type Checker

- **TypeScript strict mode** — all strict flags enabled (see tsconfig notes)
- `pnpm typecheck` → `tsc --noEmit`
- `pnpm lint` → configured in server (no separate eslint config detected in root)

## TypeScript Strictness (`tsconfig.base.json`)

```json
"strict": true,
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true,
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true
```

## Install Mechanism

1. `bash install.sh` (or `curl | bash` from GitHub)
2. Prereqs checked: `node >= 20`, `git`, `pnpm`
3. Server built: `pnpm install --silent && pnpm --silent build` in `server/`
4. Assets copied to `~/.claude/` (commands, agents, workflows)
5. MCP config merged into `~/.claude/settings.local.json` via inline Node script
6. Dispatcher written to `~/.local/bin/forge`
7. Version tag written to `~/.forge/version`

## MCP Servers Registered at Install

| Server | Transport | Purpose |
|---|---|---|
| `forge-tools` | node `dist/index.js` stdio | git/docker/k8s/pnpm/compliance tools |
| `nuxt-docs` | npx mcp-remote | Nuxt framework docs |
| `nuxt-ui` | npx mcp-remote | Nuxt UI components |
| `context7` | npx @upstash/context7-mcp | TailwindCSS + general library docs |
