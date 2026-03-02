# Phase 1 — Foundation

**Goal**: Working install from GitHub. All 33 MCP tools return structured JSON.
Core workflow commands functional. `/forge:map` initializes a project.

---

## Track A — MCP Tools Server

- [ ] A1: Scaffold `server/` (package.json, tsconfig, entry point)
- [ ] A2: `server/src/lib/runner.ts` — safe spawn wrapper
- [ ] A3: `server/src/lib/output.ts` — dual output helper
- [ ] A4: `server/src/lib/validation.ts` — flag injection prevention
- [ ] A5: `server/src/lib/errors.ts` — typed error categories
- [ ] A6: `server/src/schemas/index.ts` — all Zod output schemas
- [ ] A7: `server/src/tools/git.ts` — 10 git tools
- [ ] A8: `server/src/tools/docker.ts` — 9 docker tools
- [ ] A9: `server/src/tools/k8s.ts` — 9 k8s tools
- [ ] A10: `server/src/tools/pnpm.ts` — 5 pnpm tools
- [ ] A11: `server/src/index.ts` — server entry, registers all tools

## Track B — Commands, Agents, Workflows

- [ ] B1: Scaffold `commands/forge/`, `agents/`, `workflows/`, `templates/`
- [ ] B2: Core agents: mapper, researcher, planner, plan-checker, executor
- [ ] B3: `workflows/` detail files (one per command)
- [ ] B4: Commands: map, recon, continue, status, help, settings, quick
- [ ] B5: Commands: discuss, spec, plan, build
- [ ] B6: Commands: review, secure, release, handoff
- [ ] B7: Commands: drift, diagnose, fire, audit
- [ ] B8: Commands: learn, evolve, promote, docs
- [ ] B9: `templates/.forge/` — config.json, map/, compliance/, state/ templates

## Track C — Repo Infrastructure

- [ ] C1: Root `package.json` + `tsconfig.base.json`
- [ ] C2: `install.sh` — full interactive installer
- [ ] C3: `update.sh` — git pull + rebuild + re-copy
- [ ] C4: `uninstall.sh` — clean removal
- [ ] C5: `.gitignore` — server/dist, node_modules, secrets
- [ ] C6: `forge` dispatcher script (shell alias after install)

## Track D — Integration (depends on A + B + C)

- [ ] D1: Vitest tests for all 33 MCP tools (fixture-based)
- [ ] D2: End-to-end: install on clean dir → `/forge:map` → produces `.forge/`
- [ ] D3: MCP server smoke test (all tools respond without error)
