# Forge Help

Display available commands, organized by workflow stage.

This workflow is invoked by `/forge:help`.

## Output

Display this help text:

```
FORGE — AI Development Workflow
════════════════════════════════════════════════════════════════

WORKFLOW (run in this order for a new feature)

  /forge:map                    Initialize or refresh the project map
  /forge:recon [task]           Gather codebase context for a task
  /forge:discuss                Structured conversation, locks decisions
  /forge:spec                   Convert discussion into a PRD (REQ-NNN format)
  /forge:plan                   Decompose spec into wave-based implementation graph
  /forge:authorize              GATE 1 → authorize → worktree → autonomous build
  /forge:review                 GATE 2 → review output → create PR
  /forge:release                GATE 3 → approve deploy → compliance artifacts

DAILY

  /forge:continue               Pick up where you left off (run this first)
  /forge:status                 Current phase, open PRs, blockers (fast)
  /forge:handoff                Save session state before stopping
  /forge:quick [task]           Fast path for trivial tasks (no spec, no plan)

MAINTENANCE

  /forge:drift                  Detect divergence between map and codebase
  /forge:health                 Validate .forge/ directory structure
  /forge:diagnose               Structured root-cause triage for failures
  /forge:fire                   Incident response: TRIAGE → ISOLATE → DIAGNOSE → PATCH → DEBRIEF
  /forge:secure                 Security audit (code, deps, secrets, infra)
  /forge:audit                  Verify all requirements met, NIGC-formatted output
  /forge:improve                Post-build refactoring pass (no functionality changes)

KNOWLEDGE

  /forge:learn                  Capture session patterns to .forge/instincts/
  /forge:evolve                 Classify instincts into commands/skills/agents
  /forge:promote                Elevate project instincts to global scope (~/.claude/)
  /forge:docs                   Generate TICS/SICS compliance documentation

CONFIGURATION

  /forge:settings               Edit .forge/config.json
  /forge:help                   This help text

════════════════════════════════════════════════════════════════

COMMON STARTING POINTS

  New project:       /forge:map
  New session:       /forge:continue
  New feature:       /forge:recon [describe what you want to build]
  Quick fix:         /forge:quick [describe the change]
  Something broken:  /forge:diagnose  or  /forge:fire (if production)

COMPLIANCE ARTIFACTS

  All workflow runs generate audit artifacts in .forge/compliance/:
    change-requests/    One file per approved spec (NIGC 543.20(g))
    deployment-logs/    One file per release
    security-audits/    One file per /forge:secure run
    incidents/          One file per /forge:fire session
    audit-trail.md      Append-only action log

════════════════════════════════════════════════════════════════
```
