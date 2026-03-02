# Forge — Phase 1 Handoff
**Date**: 2026-03-02
**Session**: Initial build — design through Phase 1 implementation
**Status**: Phase 1 COMPLETE. Ready to install and test, then begin Phase 2.

---

## What This Project Is

A personal AI development workflow built on Claude Code. Fork of GSD (get-shit-done)
extended with: persistent project map, NIGC 25 CFR 543.20 compliance artifacts,
custom MCP tools server, and a compounding knowledge system.

**GitHub**: git@github.com:daresTheDevil/forge.git
**Local**: /Users/dkay/code/forge/
**Install**: `git clone git@github.com:daresTheDevil/forge.git ~/.forge && ~/.forge/install.sh`

---

## Key Design Decisions Made This Session

1. **Fork GSD, not rebuild CC-Forge** — GSD's lean orchestrator + fresh subagent
   architecture solves context loss structurally. Our gaps are exactly GSD's gaps.

2. **Flat repo, no pnpm workspaces** — Commands are markdown, server is TypeScript.
   They don't import each other. No workspace overhead needed.

3. **GitHub install, not npm** — `git clone + install.sh`. No publish step.
   `forge update` = `git pull + rebuild`.

4. **Worktrees at Gate 1 (build authorization)** — Human zone runs in main working
   directory. Autonomous zone runs in `.claude/worktrees/CR-[ID]/`.
   The worktree branch becomes the PR branch. Gate 2 = PR review.

5. **No custom MCP servers** — Pare covers commodity tools better than we'd build.
   Our `server/` is our own implementation for independence (no external dependency risk).
   Nuxt/Nuxt-UI have first-party MCP servers. Context7 covers everything else.

6. **Compliance by design** — NIGC 25 CFR 543.20 (Choctaw Gaming Commission).
   This is internal IT software (reporting/user management), NOT gaming software.
   GLI-19/547 lab certification does NOT apply.
   The three human gates (spec approval, PR review, deploy approval) satisfy:
   - Authorization before implementation (543.20(g))
   - Four-eyes / segregation of duties
   - Deployment log with approver identity

---

## What Was Built (Phase 1)

### MCP Tools Server (`server/`)
- 33 tools: 10 git, 9 docker, 9 k8s (microk8s/talos), 5 pnpm
- TypeScript strict mode — compiles clean, zero errors
- Dual output pattern: structuredContent (Zod JSON) + content (human text)
- Flag injection prevention on all user inputs
- Typed error categories with recovery suggestions
- Key files: `server/src/index.ts`, `server/src/tools/`, `server/src/lib/`

### Commands (25 total, `commands/forge/`)
All installed as `/forge:*` slash commands in Claude Code.
Phase 1 implemented: map, recon, discuss, spec, plan, build, continue, status, handoff, quick, help
Phase 2-5 stubs: review, secure, release, drift, diagnose, fire, audit, improve, learn, evolve, promote, docs, settings, health

### Agents (5, `agents/`)
- `forge-mapper` — codebase analysis, writes .forge/map/
- `forge-researcher` — context gathering for recon (read-only)
- `forge-planner` — wave-based XML plan generation
- `forge-plan-checker` — 8-dimension plan validation
- `forge-executor` — TDD implementation with atomic commits

### Workflows (22, `workflows/forge/`)
Phase 1 fully implemented: map, recon, discuss, spec, plan, build, continue, status, handoff, quick, help
All others are Phase 2-5 placeholders.

### Install Scripts
- `install.sh` — interactive installer, builds server, copies files, configures 4 MCPs
- `update.sh` — git pull + rebuild + reinstall
- `uninstall.sh` — clean removal with confirmation
- `forge` dispatcher → `~/.local/bin/forge`

### Configured MCP Servers (installed by install.sh)
| Key | What |
|---|---|
| forge-tools | Our server: git/docker/k8s/pnpm |
| nuxt-docs | https://mcp.nuxt.com/ (official Nuxt docs) |
| nuxt-ui | https://ui.nuxt.com/mcp (official Nuxt UI) |
| context7 | @upstash/context7-mcp (TailwindCSS + general) |

---

## What Needs to Happen Next (in order)

### Immediate (before Phase 2)
1. **Test the installer** on a real project:
   ```bash
   cd ~/.forge && ./install.sh    # or re-run if already done
   cd ~/code/[any-project]
   # Open Claude Code
   # /forge:map
   # Verify .forge/map/ gets created
   ```
2. **Verify MCP server** is registered:
   ```
   claude mcp list   # should show forge-tools, nuxt-docs, nuxt-ui, context7
   ```
3. Fix any issues found during testing

### Phase 2 — Compliance Layer
Implement these workflows (currently placeholders):
- `workflows/forge/review.md` — code review, test review, opens PR
- `workflows/forge/secure.md` — security audit, writes `.forge/compliance/security-audits/`
- `workflows/forge/release.md` — Gate 2 + Gate 3, deployment log, semver
- `workflows/forge/audit.md` — NIGC-formatted findings report

New agent to write:
- `agents/forge-reviewer.md` — code review, test review, PR creation
- `agents/forge-security.md` — security audit, generates compliance artifact

New MCP package to build:
- `server/src/tools/compliance.ts` (or a separate `servers/compliance/` package)
  Generates NIGC-formatted documents from templates

### Phase 3 — Intelligence Layer
- `workflows/forge/drift.md` — map/code divergence detection
- `workflows/forge/improve.md` — post-build refactor pass
- `workflows/forge/learn.md`, `evolve.md`, `promote.md` — instinct lifecycle (ECC pattern)
- Map auto-update hooks (after build, after release)

### Phase 4 — Operational Commands
- `workflows/forge/fire.md` — incident response
- `workflows/forge/diagnose.md` — structured triage
- `workflows/forge/health.md` — .forge/ integrity check

### Phase 5 — Documentation Generation
- `workflows/forge/docs.md` — TICS/SICS generator
  Maps each NIGC 25 CFR 543.20 requirement to the forge artifact that satisfies it
  This is the deliverable for the CNGC IT audit

---

## File Structure Reference

```
forge/
  SPEC.md                    Full technical specification
  README.md                  User-facing walkthrough + inspired by section
  PHASE1.md                  Phase 1 task checklist (all done)
  install.sh / update.sh / uninstall.sh
  package.json + tsconfig.base.json
  server/                    MCP tools server (TypeScript)
    src/
      index.ts               Entry point
      lib/                   runner, output, validation, errors
      schemas/index.ts       All Zod schemas
      tools/                 git.ts, docker.ts, k8s.ts, pnpm.ts, index.ts
    dist/                    Built output (gitignored)
    package.json + tsconfig.json
  commands/forge/            25 slash command stubs
  agents/                    5 agent prompt files
  workflows/forge/           22 workflow files
  templates/.forge/          Templates copied on project init
```

---

## Compliance Context (for CNGC IT audit)

- **Applicable standard**: NIGC 25 CFR 543.20 (MICS for IT)
- **NOT applicable**: GLI-19, 25 CFR 547 (gaming software lab cert)
- **Governing body**: Choctaw Nation Gaming Commission (CNGC)
- **Key requirements forge satisfies**:
  - Change request doc before any build (Gate 1) → `CR-YYYY-NNN.md`
  - Four-eyes review (Gate 2) → PR approval record
  - Deployment log with approver identity (Gate 3) → deployment-log.md
  - Audit trail (append-only) → `.forge/compliance/audit-trail.md`
  - Separation of duties → build runs in worktree, deploy requires human gate
- **TICS/SICS doc**: Generated by `/forge:docs` (Phase 5)

---

## Repos / References Used

- **GSD** (foundation): https://github.com/gsd-build/get-shit-done
- **Pare** (MCP pattern): https://github.com/Dave-London/Pare
- **ECC** (learning system): https://github.com/affaan-m/everything-claude-code
- **Golutra** (agent identity): https://github.com/golutra/golutra
- **Nuxt MCP**: https://mcp.nuxt.com/
- **Nuxt UI MCP**: https://ui.nuxt.com/docs/getting-started/ai/mcp
- **NIGC IT Audit Toolkit**: https://www.nigc.gov/wp-content/uploads/2024/12/Toolkit_ITAudit_Rev12_4.pdf

---

## How to Resume

1. Open Claude Code in `/Users/dkay/code/forge/`
2. Read this file first
3. Read `SPEC.md` for full technical detail
4. Read `README.md` for the user-facing workflow
5. The next task is: test the installer, then implement Phase 2

Start new session by saying:
> "I'm resuming work on forge. Read the handoff at .forge/handoffs/handoff-phase1-complete.md and SPEC.md, then let's test the installer and start Phase 2."
