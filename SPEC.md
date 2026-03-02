# Forge — AI Development Workflow Specification

**Version**: 0.1.0
**Status**: APPROVED — Ready for Implementation
**Date**: 2026-03-02

---

## 1. Overview

Forge is a personal AI-assisted development workflow system built on top of Claude Code.
It is a fork of GSD (get-shit-done), extended with a persistent project map, a compliance
artifact layer (25 CFR 543.20 / CNGC TICS), a custom MCP tools server, and a compounding
knowledge system.

**It is not designed for public distribution. It is designed for one developer.**

### Problems It Solves (in priority order)

1. **Context loss between sessions** — the AI never knows where we left off
2. **Slow discovery** — finding relevant code/patterns before starting work is manual
3. **Compliance gaps** — code ships without an auditable change trail (CNGC IT audit)
4. **Stale code** — deprecated code that isn't removed accumulates silently

### Non-Goals

- Not a replacement for CI/CD (it feeds into it, doesn't replace it)
- Not designed for teams (single-developer workflow)
- Not a public npm package (personal tool, no distribution obligations)
- Not gaming software (internal IT systems only — 25 CFR 543.20 applies, not GLI-19/547)

---

## 2. Design Principles

1. **Simple over complex** — minimum viable implementation at every step
2. **Verbose over silent** — always tell the user what's happening and why
3. **Industry standard over custom** — use established patterns, don't invent
4. **Own your dependencies** — no runtime dependency on third-party packages
   that could be acquired, paywalled, or abandoned
5. **Compliance by design** — audit artifacts are a natural byproduct, not extra work
6. **Lean orchestrator** — the main context stays thin; subagents get fresh 200k windows

---

## 3. Architecture

```
HUMAN ZONE (collaborative — no autonomous code changes)
  map → recon → discuss → spec → plan
                                   ↓
                            [GATE 1: HUMAN APPROVES]
                            Generates: Change Request Document
                                   ↓
AUTONOMOUS ZONE (fresh subagent per task, no deployment)
  build → improve → review → secure
                                   ↓
COMPLIANCE GATE (human, non-negotiable)
  [GATE 2: HUMAN REVIEWS PR — four-eyes requirement]
                                   ↓
  [GATE 3: HUMAN APPROVES DEPLOY]
                                   ↓
  release → generates deployment log
```

### Scope Model

```
~/.claude/                     USER SCOPE — installed once, never project-specific
  commands/forge/              Slash command definitions (.md files)
  agents/                      Subagent definitions (.md files)
  skills/                      Global reusable skill library
  instincts/                   Cross-project learned patterns (promoted)
  settings.local.json          MCP server configuration

[project-root]/                PROJECT SCOPE — lives in git, version-controlled
  CLAUDE.md                    Auto-maintained by `map`. Injects .forge/ context
                               into every Claude Code session automatically.
  .forge/
    config.json                Project config (overrides user defaults)
    map/
      map.md                   Human-readable project overview (< 200 lines)
      project-graph.json       Machine-readable entity/relationship graph
      stack.md                 Technology stack, detected + documented
      infra.md                 Environments, services, connections (no secrets)
      conventions.md           Coding patterns, discovered automatically
    compliance/
      change-requests/         One .md file per approved spec (NIGC 543.20(g))
      deployment-logs/         One .md file per release
      security-audits/         One .md file per `secure` run
      incidents/               One .md file per `fire` session
      audit-trail.md           Append-only log of all significant actions
    state/
      current.md               Where we are right now (hard limit: 100 lines)
      sessions/                Session history
    skills/                    Project-specific skills (override global)
    instincts/                 Project-specific learned patterns
```

**Config precedence (lowest → highest):**
Built-in defaults → `~/.forge/config.json` → `[project]/.forge/config.json` → CLI flags

**.forge/ is committed to git.** This satisfies NIGC 90-day audit trail retention.
`.env` files, secrets, and credentials are never in `.forge/`.

---

## 4. Monorepo Structure

```
forge/                         Root
  packages/
    installer/                 npx entry point (Node.js, zero runtime deps)
      src/
        index.js               Interactive setup wizard
    cli/                       The workflow engine
      commands/forge/          Slash command .md files
      agents/                  Subagent .md files
      skills/                  Global skill library .md files
      workflows/               Detailed workflow logic (commands @-include these)
      templates/               .forge/ directory templates
    servers/
      tools/                   Custom MCP server (git, docker, k8s, pnpm)
        src/
          index.ts             Server entry point
          tools/
            git.ts
            docker.ts
            k8s.ts
            pnpm.ts
          schemas/
            index.ts           Zod output schemas
          lib/
            runner.ts          Safe spawn wrapper
            output.ts          Dual output helper
            validation.ts      Input security validation
            errors.ts          Structured error responses
      compliance/              NIGC artifact generator MCP (Phase 2)
  .claude/                     Forge's own development context
    CLAUDE.md
  package.json                 Workspace root (pnpm workspaces)
  pnpm-workspace.yaml
  tsconfig.base.json
```

---

## 5. Package: Installer (`packages/installer`)

### Invocation

Installing from GitHub — no npm publish required:

```bash
# First install
curl -fsSL https://raw.githubusercontent.com/daresthedevil/forge/main/install.sh | bash

# Or clone and install manually
git clone https://github.com/daresthedevil/forge ~/.forge
~/.forge/install.sh

# Update (run from anywhere after first install)
forge update

# Uninstall
forge uninstall
```

The installer clones/pulls the repo to `~/.forge` and builds from source.
Updates pull the latest `main` branch and rebuild. No npm account needed.
No publish step needed. Push to GitHub → available immediately on next `forge update`.

The install script checks for: `node >= 20`, `git`, `pnpm`. Fails with a clear
message if any are missing.

### What It Does (Interactive)

1. Detect existing Claude Code installation (check `~/.claude/` exists)
2. Prompt: global or local scope
3. Copy `packages/cli/commands/forge/` → `{scope}/commands/forge/`
4. Copy `packages/cli/agents/` → `{scope}/agents/`
5. Copy `packages/cli/skills/` → `{scope}/skills/`
6. Configure MCP servers in `{scope}/settings.local.json`:
   - `forge-tools` (our custom stdio server — `node packages/servers/tools/dist/index.js`)
   - `nuxt-docs` (remote HTTP — `npx mcp-remote https://mcp.nuxt.com/`)
   - `nuxt-ui` (remote HTTP — `npx mcp-remote https://ui.nuxt.com/mcp`)
   - `context7` (stdio — `npx -y @upstash/context7-mcp`)
7. Build the tools MCP server (`pnpm build` in `packages/servers/tools/`)
8. Initialize `~/.forge/config.json` with user defaults
9. Print success summary with next steps

### Update Flow

```
forge update
  1. cd ~/.forge && git pull origin main
  2. pnpm install (picks up any new dependencies)
  3. pnpm build  (rebuilds MCP tools server)
  4. Re-copies commands/agents/skills to ~/.claude/
  5. Preserves any local modifications (see below)
  6. Reports what changed (git log since last update)
```

### Tracks Local Modifications

Before overwriting any command or agent file, the installer diffs against the
installed version and backs up user edits to `~/.forge-custom/`. On update,
custom edits are reapplied after install. If there's a conflict, the user is
shown the diff and asked to resolve it.

---

## 6. Package: CLI (`packages/cli`)

### Command Inventory

All commands use the `/forge:` namespace. They are `.md` files in `commands/forge/`.
Command files are thin routing stubs that `@`-include the detailed logic from `workflows/`.

#### Workflow Commands

| Command | Replaces (GSD) | Purpose |
|---|---|---|
| `/forge:map` | `map-codebase` | Initialize/update persistent project map. Runs 4 parallel agents. Updates `.forge/map/` and `CLAUDE.md`. |
| `/forge:recon [task]` | — (new) | Given a task description, gather all relevant context: files, patterns, docs, conventions. Seeds the discuss session. |
| `/forge:discuss` | `discuss-phase` | Structured conversation. Scouts codebase first. Identifies gray areas. Locks decisions into artifact for spec. |
| `/forge:spec` | — (extended) | Convert discuss artifact into structured PRD with traceable requirement IDs (REQ-NNN format). |
| `/forge:plan` | `plan-phase` | Decompose approved spec into wave-based XML implementation graph. Run plan-checker (8 dimensions). |
| `/forge:build` | `execute-phase` | Lean orchestrator + fresh subagents. TDD-first. Atomic commits. Updates `.forge/map/` on completion. |
| `/forge:improve` | — | Post-build refactoring pass. Never changes functionality. Cannot be run autonomously before human review. |
| `/forge:review` | `verify-work` | Code review, test review, documentation review. Creates PR. Generates four-eyes artifact. |
| `/forge:secure` | — (new) | Security audit: code, deps, secrets, infra. Writes `.forge/compliance/security-audits/[date].md`. |
| `/forge:release` | `complete-milestone` | SemVer bump, changelog, PR merge (Gate 2), deploy approval (Gate 3), deployment log. |

#### Utility Commands

| Command | Replaces (GSD) | Purpose |
|---|---|---|
| `/forge:continue` | `resume-work` | Load `.forge/state/current.md` + map, reconstruct context, route to next step. |
| `/forge:handoff` | `pause-work` | Structured session handoff. Writes full state for next session (or another developer). |
| `/forge:status` | `progress` | Current phase, plan, last action, blockers, open PRs. |
| `/forge:health` | `health` | Validate `.forge/` structure, detect orphans, verify map currency. |
| `/forge:drift` | — (new) | Detect divergence between map, docs, and actual codebase. Reports stale entries. |
| `/forge:diagnose` | `debug` | Structured root-cause triage for failures. Systematic, not random. |
| `/forge:fire` | — (new) | Incident response: TRIAGE → ISOLATE → DIAGNOSE → PATCH → VERIFY → DEBRIEF. Writes `.forge/compliance/incidents/`. |
| `/forge:audit` | `audit-milestone` | Verify all requirements met. Produces NIGC-formatted findings report. |
| `/forge:quick [task]` | `quick` | Fast path for trivial tasks. No ceremony. Still writes to audit trail. |
| `/forge:learn` | — (ECC) | Extract patterns from current session into `.forge/instincts/`. |
| `/forge:evolve` | — (ECC) | Classify instincts into commands/skills/agents based on trigger patterns. |
| `/forge:promote` | — (ECC) | Elevate project instincts to `~/.claude/instincts/` (global scope). |
| `/forge:docs` | — (new) | Generate TICS/SICS documentation from workflow artifacts. Last step. |
| `/forge:settings` | `settings` | Interactive config editor for `.forge/config.json`. |
| `/forge:help` | `help` | Command reference. |

### Agent Inventory

All agents are `.md` files in `agents/`. Spawned via Claude Code's `Task` tool.

| Agent | Purpose |
|---|---|
| `forge-mapper` | Analyzes codebase structure, writes map artifacts |
| `forge-researcher` | Gathers context for recon and discuss phases |
| `forge-planner` | Decomposes specs into XML implementation plans |
| `forge-plan-checker` | Validates plans against 8 dimensions before build |
| `forge-executor` | Implements plans TDD-first, commits atomically |
| `forge-reviewer` | Code review, generates four-eyes artifact |
| `forge-security` | Security audit, generates compliance artifact |
| `forge-debugger` | Root-cause triage for failures |
| `forge-synthesizer` | Combines multi-agent research outputs |

### State Model

**`.forge/state/current.md`** (hard limit: 100 lines)

```markdown
# Current State
**Project**: [name]
**Last updated**: [timestamp]
**Current phase**: [N]
**Current plan**: [plan-id]
**Last action**: [what happened]
**Next action**: [what to do next]
**Blockers**: [none | description]
**Open PRs**: [links]
**Active change request**: [CR-ID]
```

**`.forge/map/map.md`** (human-readable project overview, < 200 lines)

Sections:
- Project: name, purpose, stack
- Services: list with descriptions and relationships
- Key directories: purpose of each
- Entry points: main files to understand the app
- Conventions: established patterns
- Active work: what's in progress

**`.forge/map/project-graph.json`** (machine-readable)

```json
{
  "entities": [
    { "id": "svc-api", "type": "service", "name": "API Server", "path": "apps/api" }
  ],
  "relationships": [
    { "from": "svc-api", "to": "svc-db", "type": "depends_on" }
  ],
  "last_updated": "2026-03-02T14:30:00Z"
}
```

### Compliance Artifact Formats

**Change Request** (`.forge/compliance/change-requests/CR-[YYYY]-[NNN].md`)

```markdown
# Change Request: CR-2026-001
**Date**: [ISO timestamp]
**Title**: [from spec title]
**Requirements**: [REQ-001, REQ-002]
**Description**: [from spec]
**Requested by**: [user]
**Authorized by**: [user]
**Authorized at**: [ISO timestamp — Gate 1 approval time]
**Implementation plan**: [plan file reference]
**Status**: AUTHORIZED | COMPLETE | CANCELLED
```

**Deployment Log** (`.forge/compliance/deployment-logs/[version].md`)

```markdown
# Deployment Log: v1.2.3
**Date**: [ISO timestamp]
**Version**: 1.2.3
**Change Request**: CR-2026-001
**Environment**: production
**Commit SHA**: [full SHA]
**PR**: [link]
**Approved by**: [user] at [ISO timestamp — Gate 3]
**Reviewed by**: [user] at [ISO timestamp — Gate 2]
**Verification**: PASSED | FAILED
**Changelog**: [generated]
```

**Audit Trail** (`.forge/compliance/audit-trail.md` — append-only)

```markdown
| Timestamp | Action | Actor | Reference |
|---|---|---|---|
| 2026-03-02T14:30:00Z | spec:approved | david | CR-2026-001 |
| 2026-03-02T15:00:00Z | build:started | forge-executor | CR-2026-001 |
| 2026-03-02T16:00:00Z | pr:created | forge-reviewer | PR#42 |
| 2026-03-02T16:30:00Z | pr:approved | david | PR#42 |
| 2026-03-02T16:45:00Z | deploy:approved | david | v1.2.3 |
| 2026-03-02T16:46:00Z | release:complete | forge | v1.2.3 |
```

### The Three Human Gates

**Gate 1 — Spec Approval (before build)**
- User runs `/forge:plan` and reviews the implementation graph
- Explicitly types `/forge:build` to authorize
- System writes the Change Request document at this moment
- No code changes before this point

**Gate 2 — PR Review (before release)**
- Autonomous zone completes, creates a PR
- User reviews the PR (four-eyes / segregation of duties — NIGC 543.20)
- User approves and merges the PR
- System records reviewer identity and timestamp

**Gate 3 — Deploy Approval (at release)**
- User runs `/forge:release`
- System shows: version, changelog, what's deploying, to what environment
- User confirms
- System generates deployment log, pushes tag, deploys
- Separator of duties: the person who wrote the code cannot be the automated deployer
  (the gate enforces a conscious human decision before any production change)

---

## 7. Package: MCP Tools Server (`packages/servers/tools`)

### Purpose

A personal, owned alternative to Pare's commodity MCP servers. Zero external runtime
dependency. Implements only the tools actually used in this workflow.

### Core Pattern (per tool)

```typescript
// Safe execution: spawn (never exec), args as array, absolute binary path
// Security: validate inputs, reject flag injection (strings starting with -)
// Output: dual — structuredContent (Zod-validated JSON) + content (human text)
// Errors: typed category + suggestion, never raw exceptions
```

### Tool Inventory (~33 tools)

**Git (10 tools)**
- `git_status` — working tree status (branch, staged, modified, untracked, clean flag)
- `git_log` — commit history (hash, author, date, message, files changed)
- `git_diff` — staged or unstaged changes (file diffs with context)
- `git_show` — show specific commit details
- `git_add` — stage files or patterns
- `git_commit` — commit with message, returns new SHA
- `git_push` — push branch to remote, returns result
- `git_pull` — pull from remote, returns merge result
- `git_branch` — list branches with tracking status
- `git_checkout` — switch branch or restore files

**Docker (9 tools)**
- `docker_ps` — list containers (id, name, image, status, ports)
- `docker_build` — build image (returns image ID, layer count, duration)
- `docker_run` — run container (returns container ID)
- `docker_logs` — container logs (last N lines, structured)
- `docker_exec` — exec command in running container
- `docker_stop` — stop container by name or ID
- `docker_images` — list images (id, tag, size, created)
- `docker_compose_up` — compose up (detached, returns started services)
- `docker_compose_down` — compose down (returns stopped services)

**Kubernetes (9 tools)**
- `k8s_get` — get resources (pods, services, deployments, etc.) with namespace
- `k8s_apply` — apply manifest file or directory
- `k8s_describe` — describe resource (structured output)
- `k8s_logs` — pod logs (last N lines, optional container name)
- `k8s_exec` — exec command in pod
- `k8s_delete` — delete resource by name or label
- `k8s_rollout_status` — rollout status for deployment/daemonset
- `k8s_get_contexts` — list available contexts (microk8s, talos, etc.)
- `k8s_use_context` — switch active context

**pnpm (5 tools)**
- `pnpm_install` — install dependencies, returns packages installed count
- `pnpm_add` — add package(s), returns new package info
- `pnpm_remove` — remove package(s)
- `pnpm_run` — run script from package.json, returns exit code + output
- `pnpm_list` — list installed packages (direct deps only by default)

### Security Model

Identical to Pare's approach:
- `assertNoFlagInjection(value)` — rejects strings starting with `-`
- All CLI commands resolved to absolute paths via `which` before execution
- Subprocess uses `spawn` with args as array (never `exec` with string)
- Output capped at 10MB
- ANSI codes stripped from all output

### Error Response Format

```typescript
{
  isError: true,
  category: "command-not-found" | "permission-denied" | "timeout" |
            "invalid-input" | "not-found" | "command-failed",
  message: string,
  command?: string,
  exitCode?: number,
  suggestion: string  // what to try next
}
```

### TypeScript Requirements

- Strict mode enabled
- Zod schemas for all tool inputs and outputs
- Each tool file exports its schema separately (enables documentation generation)
- No `any` types

---

## 8. Full MCP Stack

### Configured by Installer

| Server Key | Package / URL | Transport | Purpose |
|---|---|---|---|
| `forge-tools` | `node [dist/index.js]` | stdio | Our custom git/docker/k8s/pnpm server |
| `nuxt-docs` | `https://mcp.nuxt.com/` | HTTP via mcp-remote | Nuxt framework documentation |
| `nuxt-ui` | `https://ui.nuxt.com/mcp` | HTTP via mcp-remote | Nuxt UI components, props, examples |
| `context7` | `npx -y @upstash/context7-mcp` | stdio | TailwindCSS + general library docs |

### CLAUDE.md Instruction Snippet (auto-added by installer)

```
When forge-tools MCP tools are available (prefixed with mcp__forge-tools__),
prefer them over running raw CLI commands. They return structured JSON.

For Nuxt/Nuxt-UI documentation, use mcp__nuxt-ui__ and mcp__nuxt-docs__ tools.
For TailwindCSS and other library docs, use mcp__context7__ tools.
```

---

## 9. Implementation Phases

### Phase 1 — Foundation (build both packages together)

**Deliverables:**
- Monorepo structure initialized (pnpm workspaces)
- `packages/servers/tools` — all 33 tools implemented and tested
- `packages/cli` — core commands: `map`, `recon`, `discuss`, `spec`, `plan`, `build`, `continue`, `status`, `handoff`, `quick`, `help`
- Core agents: `forge-mapper`, `forge-researcher`, `forge-planner`, `forge-plan-checker`, `forge-executor`
- `packages/installer` — interactive setup wizard
- `.forge/` directory template
- `CLAUDE.md` auto-generation

**Acceptance criteria:**
- [ ] `npx forge@latest` completes without error on a clean machine
- [ ] All 4 MCP servers appear in `claude mcp list` after install
- [ ] `/forge:map` runs in a test project and produces `.forge/map/` artifacts
- [ ] `/forge:recon "add an API endpoint"` returns relevant context in < 30 seconds
- [ ] `/forge:build` spawns a subagent with fresh context that implements a trivial feature TDD-first
- [ ] All 33 MCP tools return structured JSON (not raw CLI output)
- [ ] Git tools tested against real git operations
- [ ] Docker tools tested against running containers
- [ ] k8s tools tested against microk8s

### Phase 2 — Compliance Layer

**Deliverables:**
- Compliance artifact generation wired into: `spec`, `plan`, `build`, `review`, `secure`, `release`
- `/forge:secure` command + `forge-security` agent
- `/forge:review` command + `forge-reviewer` agent
- `/forge:release` command with all three human gates
- `/forge:audit` command
- `audit-trail.md` append-only log
- `servers/compliance` MCP package (NIGC artifact generator)

**Acceptance criteria:**
- [ ] Running `spec → plan → build → review → secure → release` produces a complete audit trail
- [ ] Change Request document matches NIGC 543.20(g) requirements
- [ ] Deployment Log captures all required fields
- [ ] A simulated CNGC auditor can trace any deployment back to its authorization
- [ ] `/forge:audit` produces a findings report formatted for the CNGC

### Phase 3 — Intelligence Layer

**Deliverables:**
- `/forge:drift` command — detects map/doc/code divergence
- `/forge:improve` command + refactor agent
- `/forge:learn`, `/forge:evolve`, `/forge:promote` commands (ECC instinct lifecycle)
- Map auto-update hooks (after build, after release)

**Acceptance criteria:**
- [ ] `/forge:drift` correctly identifies a file that was changed without updating the map
- [ ] `/forge:improve` runs without changing any function signatures or behaviors
- [ ] `/forge:learn` captures a pattern and writes it to `.forge/instincts/`
- [ ] `/forge:promote` moves an instinct to `~/.claude/instincts/`

### Phase 4 — Operational Commands

**Deliverables:**
- `/forge:fire` command — incident response protocol
- `/forge:diagnose` command — structured triage
- `/forge:health` command — validate `.forge/` integrity

**Acceptance criteria:**
- [ ] `/forge:fire` produces a debrief document with timeline and root cause
- [ ] `/forge:diagnose` follows a structured path (not random suggestions)

### Phase 5 — Documentation Generation

**Deliverables:**
- `/forge:docs` command — generates TICS/SICS from actual workflow artifacts
- Evidence mapping: each NIGC requirement → the artifact that satisfies it
- Checklist of branch protection, access control, backup testing requirements

**Acceptance criteria:**
- [ ] Running `/forge:docs` produces a TICS/SICS draft the team can review
- [ ] Every artifact referenced in the TICS exists in `.forge/compliance/`
- [ ] A CNGC auditor could use this document as the entry point for an IT audit

---

## 10. Technology Stack

- **Language**: TypeScript (strict mode throughout)
- **Runtime**: Node.js >= 20
- **Package manager**: pnpm workspaces
- **Validation**: Zod (all inputs and outputs)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Build**: `tsc` (no bundler needed for personal tools)
- **Testing**: Vitest
- **Commands**: Claude Code `.md` slash command format
- **Agents**: Claude Code `.md` agent format

---

## 11. Out of Scope (Explicitly)

- Public npm publication
- Multi-user / team collaboration features
- CI/CD pipeline replacement
- Gaming software certification (GLI-19, 25 CFR 547)
- Windows support (macOS / Linux only)
- Any GUI or web interface
