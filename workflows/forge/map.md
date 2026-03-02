# Forge Map Workflow

Initialize or refresh the project map for the current project.
This workflow is invoked by `/forge:map`.

## Step 1: Check initialization status

Look for `.forge/map/map.md` in the current working directory.

If the file does not exist:
  Tell the user: "Initializing forge for this project for the first time..."

If the file exists:
  Read the `**Generated**:` timestamp from map.md.
  Tell the user: "Refreshing project map (last generated: [timestamp])..."

## Step 2: Announce what will be produced

Tell the user:
```
forge-mapper will scan this project and produce:

  .forge/map/map.md            — project overview (< 200 lines)
  .forge/map/stack.md          — technology stack details
  .forge/map/infra.md          — infrastructure topology (no secrets)
  .forge/map/conventions.md    — coding patterns discovered
  .forge/map/project-graph.json — machine-readable entity/relationship graph

CLAUDE.md will be created or updated to @-include the map.
```

## Step 3: Create .forge/ directory structure

Ensure all of these directories exist (create if missing):
- `.forge/map/`
- `.forge/compliance/change-requests/`
- `.forge/compliance/deployment-logs/`
- `.forge/compliance/security-audits/`
- `.forge/compliance/incidents/`
- `.forge/state/sessions/`
- `.forge/plans/`
- `.forge/specs/`
- `.forge/discuss/`
- `.forge/instincts/`
- `.forge/skills/`

## Step 4: Initialize .forge/config.json if missing

If `.forge/config.json` does not exist, create it with these contents:
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

## Step 5: Initialize .forge/compliance/audit-trail.md if missing

If the file does not exist, create it with:
```markdown
# Audit Trail

This file is append-only. Every significant forge action is recorded here.
For CNGC IT audit: this file provides the tamper-evident action history.
Git history provides the tamper-evident retention (90-day requirement: commit this file).

| Timestamp | Action | Actor | Reference |
|---|---|---|---|
| [ISO timestamp of now] | project:initialized | forge | - |
```

## Step 6: Initialize .forge/state/current.md if missing

If `.forge/state/current.md` does not exist, create it with:
```markdown
# Current State
**Project**: [project name — get from package.json or directory name]
**Last updated**: [ISO timestamp of now]
**Current task**: none
**Current phase**: none
**Last action**: project initialized
**Next action**: run /forge:map to initialize the project map
**Blockers**: none
**Open PRs**: none
**Active change request**: none
```

## Step 7: Spawn forge-mapper agent

Spawn the `forge-mapper` agent with the current working directory as the argument.

Wait for the agent to complete. It will write all map files.

If the agent reports an error, display the error and stop.

## Step 8: Display completion summary

After the mapper agent completes, display:
```
Map complete.
  Stack: [one-line from map.md]
  Services: [N] detected
  Key directories: [N] documented

Files written:
  .forge/map/map.md
  .forge/map/stack.md
  .forge/map/infra.md
  .forge/map/conventions.md
  .forge/map/project-graph.json
  CLAUDE.md [created | updated | already up to date]
```

## Step 9: Ask about git commit

Ask the user: "Commit .forge/ to git to start tracking the audit trail? [y/n]"

If yes:
  Run: `git add .forge/ CLAUDE.md`
  Run: `git commit -m "chore: initialize forge project map"`
  Tell user: "Committed. The .forge/ directory is now tracked in git."
  Tell user: "This satisfies the NIGC 90-day audit trail retention requirement."

If no:
  Tell user: "OK. Run /forge:map any time to regenerate. Remember to commit .forge/ before your next release."

## Step 10: Update audit trail

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | map:generated | forge | .forge/map/map.md |
```
