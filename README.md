# Forge

A personal AI development workflow built on Claude Code. Persistent context,
structured process, and automatic compliance artifacts for every project.

---

## Installation

```bash
git clone https://github.com/daresthedevil/forge ~/.forge
~/.forge/install.sh
```

The installer will:
- Build the MCP tools server (TypeScript → JS)
- Copy commands, agents, and skills to `~/.claude/`
- Configure MCP servers (forge-tools, nuxt-ui, nuxt-docs, context7)
- Initialize `~/.forge/config.json`

**Requirements**: Node.js >= 20, git, pnpm

**To update:**
```bash
forge update
```

**To uninstall:**
```bash
forge uninstall
```

---

## How It Works

Forge splits every piece of work into two distinct zones with human approval gates
between them. This is not ceremony — it's how the CNGC IT audit requirement for
segregation of duties and authorization-before-implementation is satisfied automatically.

```
HUMAN ZONE          → You talk to Claude. No code is written.
    ↓ [Gate 1]      → You approve the plan. Worktree is created.
AUTONOMOUS ZONE     → Claude builds, tests, reviews, and secures. You watch.
    ↓ [Gate 2]      → You review the PR. Four-eyes requirement satisfied.
    ↓ [Gate 3]      → You approve the deploy. Deployment log written.
RELEASED            → Compliance artifacts committed. Map updated.
```

---

## Setting Up a New Project

Run this once when you start working in a new project directory:

```
/forge:map
```

Forge will:
1. Scan the codebase (4 parallel agents)
2. Write `.forge/map/` — project graph, stack, conventions, infrastructure
3. Create `.forge/config.json` — project-specific settings
4. Create/update `CLAUDE.md` — injects project context into every future session automatically

After this, every time you open Claude Code in this directory, forge knows:
- What the project is and what it does
- The full file/service/dependency map
- Established coding conventions
- Where you left off

Commit `.forge/` to git. The map and compliance artifacts are version-controlled
alongside your code.

---

## The Full Feature Workflow

### Step 1 — Recon

Tell forge what you want to build. It finds everything relevant before you talk about it.

```
/forge:recon I want to add a CSV export for the user management report
```

Forge reads the map, searches the codebase, and pulls in:
- Existing API patterns relevant to this feature
- Related files, functions, and services
- Relevant Nuxt/Nuxt-UI/TailwindCSS documentation (via MCP)
- Established conventions for this type of feature

This seeds the discuss session so you're not starting cold.

---

### Step 2 — Discuss

A structured conversation about what you're building. Forge acts as both
facilitator and devil's advocate.

```
/forge:discuss
```

Forge will:
- Scout the codebase for reusable assets and integration points it found during recon
- Surface 3–4 specific gray areas for this feature (not generic — real decisions you need to make)
- Challenge your assumptions and flag potential issues
- Lock every decision into a discussion artifact

You'll know you're done when every gray area has a locked decision.

---

### Step 3 — Spec

Convert the discussion artifact into a structured PRD with traceable requirement IDs.

```
/forge:spec
```

Output: A spec document with requirements in `REQ-NNN` format. Every requirement
has a machine-checkable acceptance criterion. This is the contract the plan and
build phases are held against.

Review it. If anything is wrong, go back to `/forge:discuss`. Don't proceed until
the spec is right — everything downstream is built from this.

---

### Step 4 — Plan

Break the approved spec into a dependency-ordered implementation graph.

```
/forge:plan
```

Forge spawns a planner agent and a plan-checker agent. The plan-checker validates
against 8 dimensions and sends it back to the planner if it fails. After up to 3
rounds, you see the final plan.

The plan uses a wave-based structure:
- Wave 1 tasks run in parallel
- Wave 2 tasks wait for Wave 1 to complete
- Each task has: files to touch, what to do, how to verify it's done

Review the plan. This is your last chance to change course before code is written.

---

### Step 5 — Build (Gate 1)

When you run build, you are authorizing the change. This is Gate 1.

```
/forge:build
```

**What happens at Gate 1:**
- Forge writes a Change Request document to `.forge/compliance/change-requests/CR-[YYYY]-[NNN].md`
  This is the authorization record required by NIGC 25 CFR 543.20(g)
- A git worktree is created at `.claude/worktrees/CR-[ID]/` on branch `forge/CR-[ID]`
- All autonomous work happens inside that worktree — nothing touches your working directory

**What happens in the autonomous zone:**

The lean orchestrator reads the plan and dispatches fresh subagents per wave. Each
subagent gets a full 200k context window. The orchestrator itself stays lean (~10-15%
of its context) and passes file paths, not content, to each agent.

For each plan task, the executor:
1. Writes failing tests first (TDD)
2. Implements the feature until tests pass
3. Makes an atomic git commit: `feat(CR-001-01): implement user CSV export [REQ-001]`
4. Writes a summary of what was done

If an executor hits a wall it cannot solve, it stops and surfaces the blocker to you.
This is the only time the autonomous zone asks for input.

After all waves complete:
- The improve agent runs a refactoring pass (no functionality changes)
- The reviewer agent does code review, test review, and documentation review
- The security agent runs a security audit (code, deps, secrets)
- A PR is opened from the worktree branch to main

You'll see a summary when the autonomous zone is done.

---

### Step 6 — Review (Gate 2)

Review the PR. This is the four-eyes requirement — you are the second set of eyes
on everything the autonomous zone produced.

```
/forge:review
```

This shows you:
- The full diff (what changed)
- Test results
- Security audit findings
- Any issues the reviewer flagged

Fix anything that needs fixing. When you approve and merge the PR, Gate 2 is
satisfied. The reviewer identity and timestamp are recorded in the compliance trail.

---

### Step 7 — Release (Gate 3)

```
/forge:release
```

Forge shows you:
- What version will be tagged (semver, auto-calculated from commit types)
- The generated changelog
- What environment will receive the deployment

You confirm. This is Gate 3. Forge then:
- Merges the branch
- Tags the release
- Deploys to the configured environment
- Writes the deployment log to `.forge/compliance/deployment-logs/v[VERSION].md`
- Updates the project map (marks the feature as implemented)
- Cleans up the worktree

**The deployment log records**: version, timestamp, your identity as approver, commit SHA,
environment, PR link, and verification result. This is the artifact the CNGC auditor
will look at during an IT audit.

---

## The Worktree Model Explained

When `/forge:build` runs, it creates a git worktree — an isolated copy of your
repository on a separate branch. Think of it as a sandboxed workspace where the
autonomous zone operates.

```
Your working directory          The worktree
~/.../my-project/               ~/.../my-project/.claude/worktrees/CR-2026-001/
  (your code, unchanged)          (where all autonomous changes happen)
  main branch                     forge/CR-2026-001 branch
```

**Why this matters:**
- You can keep working while build runs (your files are untouched)
- The PR diff is clean and isolated — exactly what the build produced
- If something goes wrong, you discard the worktree and nothing is damaged
- The worktree branch becomes the PR branch automatically

**After Gate 3 (release):**
The worktree is merged and cleaned up. The `forge/CR-2026-001` branch is deleted.
Your working directory is updated with the merged changes.

**If build fails or you abandon it:**
```
/forge:worktree discard
```
The worktree is deleted. Nothing happened to your codebase.

---

## Daily Workflow

### Picking up where you left off

```
/forge:continue
```

Reads `.forge/state/current.md` and tells you exactly where you are:
- What phase you're in
- What the last action was
- What to do next
- Any open PRs or blockers

This is the first command you run every session. It reconstructs full context
automatically — no hunting through chat history.

### Checking status

```
/forge:status
```

Shows current phase, plan progress, open PRs, last action, and any blockers.

### Quick tasks (no ceremony)

For trivial changes that don't need the full workflow:

```
/forge:quick fix the typo in the user export button label
```

Still writes to the audit trail. Still uses git. Does not use a worktree.
Does not generate a formal change request. Use this for small, low-risk changes
that would be over-engineered by the full workflow.

---

## Maintaining the Project Map

The map stays current automatically after each build and release. But if you make
manual changes outside the forge workflow, refresh it:

```
/forge:map
```

To check if the map has drifted from the actual codebase:

```
/forge:drift
```

Drift detection flags:
- Files referenced in the map that no longer exist
- New files that aren't in the map
- Services that changed their interfaces
- Dependencies that were added or removed

---

## Security Audit

Run a standalone security audit at any time:

```
/forge:secure
```

Checks: code vulnerabilities, dependency audit, secrets scan, infrastructure review.
Writes findings to `.forge/compliance/security-audits/[date].md`.

This also runs automatically as part of every build cycle (before the PR is opened).

---

## Incident Response

When something is actively broken in production:

```
/forge:fire
```

Activates structured incident response: TRIAGE → ISOLATE → DIAGNOSE → PATCH → VERIFY → DEBRIEF

Forge helps you move fast and systematically. At the end, a debrief document is written
to `.forge/compliance/incidents/[ID].md` — this satisfies NIGC incident response documentation
requirements.

---

## Compliance Artifacts

Every workflow run generates audit-ready documentation automatically.

```
.forge/compliance/
  change-requests/        One file per approved spec
  deployment-logs/        One file per release
  security-audits/        One file per secure run
  incidents/              One file per fire session
  audit-trail.md          Append-only log of all significant actions
```

**For a CNGC IT audit**, the auditor can:
1. Read `audit-trail.md` for the complete action history
2. Trace any deployment to its change request (authorization record)
3. Verify four-eyes review via PR history + Gate 2 timestamp
4. Confirm deployment log matches git tag and commit SHA
5. Review security audit history

The git history of `.forge/compliance/` provides tamper-evident retention because
every append is a commit.

To generate the TICS/SICS documentation (run this when preparing for an audit):

```
/forge:docs
```

Produces a TICS draft that maps each NIGC 25 CFR 543.20 requirement to the
artifact or control in your workflow that satisfies it.

---

## Knowledge Accumulation

Forge gets smarter about your codebase over time.

### Capturing a pattern from a session

```
/forge:learn
```

Extracts patterns from what happened in the current session and saves them to
`.forge/instincts/`. Things like: how you prefer to structure API endpoints in
this project, what testing patterns you use, what conventions were established.

### Classifying instincts

```
/forge:evolve
```

Reviews accumulated instincts and classifies them:
- Recurring explicit requests → commands
- Auto-triggered behaviors → skills
- Multi-step orchestration → agents

### Promoting to global scope

```
/forge:promote
```

When a pattern is useful across all your projects (not just this one), promote it
to `~/.claude/instincts/`. It's now available in every project.

---

## MCP Servers

Installed automatically. These give Claude structured JSON instead of raw terminal output.

| Server | Purpose |
|---|---|
| `forge-tools` | git, docker, k8s/microk8s/talos, pnpm — your own server, no external dependency |
| `nuxt-ui` | Nuxt UI component docs, props, slots, events |
| `nuxt-docs` | Nuxt framework documentation |
| `context7` | TailwindCSS and general library documentation |

The `forge-tools` server lives in your forge repo. You own it. If you need a new
tool or a custom wrapper for an internal CLI, add it there.

---

## Configuration

**Project config** (`.forge/config.json` — committed to git):

```json
{
  "model_profile": "balanced",
  "workflow": {
    "plan_checking": true,
    "auto_advance": false,
    "max_concurrent_agents": 3
  },
  "gates": {
    "require_spec_approval": true,
    "require_pr_review": true,
    "require_deploy_approval": true
  },
  "compliance": {
    "change_request_prefix": "CR",
    "audit_trail": true
  }
}
```

**User config** (`~/.forge/config.json` — not committed):

```json
{
  "model_profile": "balanced",
  "github_username": "daresthedevil"
}
```

Project config overrides user config. User config overrides built-in defaults.

---

## Command Reference

| Command | Description |
|---|---|
| `/forge:map` | Initialize or refresh the project map |
| `/forge:recon [task]` | Gather context for a task before discussing |
| `/forge:discuss` | Structured conversation, locks decisions |
| `/forge:spec` | Convert discussion to PRD with requirement IDs |
| `/forge:plan` | Break spec into wave-based implementation graph |
| `/forge:build` | Gate 1 → creates worktree → autonomous build |
| `/forge:improve` | Post-build refactor (no functionality changes) |
| `/forge:review` | Code, test, and doc review — opens PR |
| `/forge:secure` | Security audit — code, deps, secrets, infra |
| `/forge:release` | Gate 2 + Gate 3 → deploy with compliance artifacts |
| `/forge:continue` | Pick up where you left off |
| `/forge:handoff` | Write structured session handoff |
| `/forge:status` | Current phase, plan, open PRs, blockers |
| `/forge:health` | Validate `.forge/` structure |
| `/forge:drift` | Detect map/code divergence |
| `/forge:diagnose` | Structured root-cause triage |
| `/forge:fire` | Incident response protocol |
| `/forge:audit` | Verify all requirements met, NIGC-formatted output |
| `/forge:quick [task]` | Fast path for trivial tasks |
| `/forge:learn` | Capture session patterns |
| `/forge:evolve` | Classify instincts into commands/skills/agents |
| `/forge:promote` | Elevate project instincts to global scope |
| `/forge:docs` | Generate TICS/SICS compliance documentation |
| `/forge:settings` | Edit project config |
| `/forge:help` | Command reference |

---

## Inspired By

Forge is built on the shoulders of people who figured out better ways to work.

| Project | What We Took |
|---|---|
| **[get-shit-done](https://github.com/gsd-build/get-shit-done)** | The foundation. The lean orchestrator + fresh subagent architecture, wave-based parallel execution, XML plan format, goal-backward plan verification, and the `npx` installer pattern. If forge is useful, 80% of the credit goes here. |
| **[Pare](https://github.com/Dave-London/Pare)** | The MCP server pattern: dual output (structured JSON + human text), safe spawn execution, typed error categories, Zod schema contracts, and the philosophy of stripping everything the AI doesn't need. Our `server/` is built from this blueprint. |
| **[everything-claude-code](https://github.com/affaan-m/everything-claude-code)** | The instinct lifecycle (learn → evolve → promote), strategic compaction, token economics thinking, and the five-layer composition model (rules, skills, commands, agents, hooks). |
| **[golutra](https://github.com/golutra/golutra)** | The idea that AI tools should have named identities and team context, and the OSC-based process lifecycle signaling pattern. |

The compliance layer, persistent project map, recon command, worktree integration,
and TICS/SICS generation are original to forge.

---

## Repository Structure

```
forge/
  commands/forge/      Slash command definitions (.md)
  agents/              Subagent definitions (.md)
  skills/              Global skill library (.md)
  workflows/           Detailed workflow logic (.md, included by commands)
  templates/           .forge/ directory templates
  server/              MCP tools server (TypeScript)
    src/
      tools/           git.ts  docker.ts  k8s.ts  pnpm.ts
      schemas/         Zod output schemas
      lib/             runner.ts  output.ts  validation.ts  errors.ts
    dist/              Built output (.gitignored, built on install)
    package.json
    tsconfig.json
  install.sh
  update.sh
  uninstall.sh
  package.json
  SPEC.md              Full technical specification
  README.md            This file
```
