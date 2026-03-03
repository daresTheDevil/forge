# Forge — Coding Conventions

**Generated**: 2026-03-02T22:00:00Z

## TypeScript — Compiler Flags

All TypeScript is compiled with the strictest available settings (`tsconfig.base.json`):

```
strict: true
noUncheckedIndexedAccess: true       — array[i] is T | undefined
exactOptionalPropertyTypes: true     — optional props cannot be set to undefined explicitly
noImplicitReturns: true
noFallthroughCasesInSwitch: true
target: ES2022
module: Node16 (ESM)
```

Import paths always include explicit `.js` extensions (ESM Node16 requirement):
```ts
import { run } from "../lib/runner.js";
```

## MCP Tool Pattern

Every tool module exports a single `register*Tools(server: McpServer): void` function.
Each individual tool follows this pattern:

```ts
server.tool(
  "tool_name",
  "Human-readable description",
  { param: z.string().describe("...") },    // Zod input schema
  async ({ param }) => {
    assertNoFlagInjection(param, "param");   // guard all user strings
    try {
      const result = await run("cmd", [args]);
      return dualOutput(parsed, (d) => `human text`);
    } catch (e) {
      return handleRunError(e, "cmd");
    }
  }
);
```

### Core library functions

| Function | Signature | Purpose |
|---|---|---|
| `run(cmd, args, opts?)` | `Promise<RunResult>` | Spawn subprocess; caps output at 10 MB; strips ANSI; resolves binary with `which` |
| `dualOutput(data, formatter)` | `CallToolResult` | Returns both `structuredContent` (JSON) and `content` (human text) |
| `makeError(category, message, suggestion, extra?)` | `CallToolResult` | Typed error with `isError: true`; always includes suggestion for recovery |
| `handleRunError(e, command)` | `CallToolResult` | Maps `command-not-found`, `timeout`, `EACCES`, and generic errors to typed responses |
| `assertNoFlagInjection(value, fieldName?)` | `void` (throws) | Rejects any string starting with `-`; prevents flag injection in CLI calls |
| `assertNoFlagInjectionList(values, fieldName?)` | `void` (throws) | Array variant of above |

### Error categories

```ts
type ErrorCategory =
  | "command-not-found"
  | "permission-denied"
  | "timeout"
  | "invalid-input"
  | "not-found"
  | "command-failed";
```

## Zod Schema Conventions

- All MCP tool response shapes are defined in `server/src/schemas/index.ts`
- Types are inferred via `z.infer<typeof Schema>`
- Schemas are named `<Domain><Concept>Schema` (e.g., `GitStatusSchema`, `DockerContainerSchema`)
- Schemas are exported alongside their inferred types
- CLI-layer Zod schemas (for plan frontmatter) live in `server/src/cli/types.ts`

## File Naming

| Pattern | Location | Convention |
|---|---|---|
| MCP tool modules | `server/src/tools/` | `[domain].ts` — lowercase singular |
| CLI modules | `server/src/cli/` | `[function].ts` — lowercase verb/noun |
| Test files | co-located with source | `[module].test.ts` |
| Lib utilities | `server/src/lib/` | `[concern].ts` — lowercase noun |
| Agents | `agents/` | `forge-[role].md` — kebab-case with forge prefix |
| Workflows | `workflows/forge/` | `[command].md` — matches slash command name |
| Commands | `commands/forge/` | `[command].md` — matches slash command name |
| Compliance artifacts | `.forge/compliance/` | `CR-YYYY-NNN.md`, `CR-YYYY-NNN-REVIEW.md`, `vX.Y.Z.md`, `YYYY-MM-DD[-CR-ID].md` |

## Workflow / Command File Convention

Commands are thin stubs — one `@-include` referencing the workflow:
```markdown
---
description: "Short description of the command"
---

@~/.claude/workflows/forge/[command].md
```

Workflows contain the full logic with sections, agent spawning instructions, and compliance steps. Workflows use `@-include` to pull in agent prompts when spawning subagents.

## Commit Message Conventions (inferred from git log)

Format: `type(scope): message — context`

| Prefix | Meaning |
|---|---|
| `feat(REQ-NNN,...)` | Feature tied to spec requirements |
| `fix(area)` | Bug fix; often includes scope like `security,perf` |
| `chore(release)` | Release + compliance gate close |
| `chore(compliance)` | Compliance artifact additions |
| `chore:` | Session state saves, handoffs, housekeeping |
| `Merge pull request` | Standard GitHub merge commit |

Wave/plan context is appended in feature commits:
`— wave N, plan NN`

Example:
```
feat(REQ-001,REQ-007): CLI entry point + arg parser — wave 4, plan 01
chore(release): Gate 3 complete — v0.2.0 released, CR-2026-001 closed
fix(security,perf): address Gate 2 review findings
```

## Three-Gate Compliance Pattern

The build/review/release workflow enforces three human gates:

| Gate | Command | Human action | Artifact |
|---|---|---|---|
| Gate 1 | `/forge:build` | Type `authorize` | `CR-YYYY-NNN.md` |
| Gate 2 | `/forge:review` | Type `create-pr` | `CR-YYYY-NNN-REVIEW.md` + PR |
| Gate 3 | `/forge:release` | Type `deploy` | `vX.Y.Z.md` deployment log |

All gate events are appended to `.forge/compliance/audit-trail.md`.

## Package Manager Convention

- Use `pnpm` — NOT `npm` or `bun`
- Run builds as `pnpm --silent build` (flag before subcommand, not after, to avoid passing `--silent` to `tsc`)
- Workspace filter: `pnpm --filter ./server [script]`

## Test Convention

- Tests in `server/src/cli/*.test.ts`
- Run targeted: `pnpm test` → `vitest run`
- Tests use pure function exports — CLI main guards with `isMain` check so `index.ts` does not auto-execute during test imports
- No test coverage target documented; all CLI modules have companion test files
