# Forge Diagnose Workflow

Structured root-cause triage for a specific failure during development.
This workflow is invoked by `/forge:diagnose [description of failure]`.

This is for **development failures** — build errors, test failures, service won't start,
unexpected behavior in a local or staging environment.

For **production incidents**, use `/forge:fire` instead.

## Step 1: Parse the failure description

`$ARGUMENTS` contains the description of what's failing.

If `$ARGUMENTS` is empty:
```
Usage: /forge:diagnose <description of what's failing>

Examples:
  /forge:diagnose "tests passing locally but failing in CI"
  /forge:diagnose "server won't start after adding the new env var"
  /forge:diagnose "database migration failing on staging"

Provide a description so the diagnosis can be targeted.
```
Stop.

Record `failure_description` = `$ARGUMENTS`.

Display:
```
DIAGNOSE
══════════════════════════════════════════════════
Failure: [failure_description]
══════════════════════════════════════════════════
Loading project context...
```

## Step 2: Load project context

Read the following files if they exist:
- `.forge/map/infra.md` — system topology, services, ports, dependencies
- `.forge/map/stack.md` — tech stack, test runner, build tools
- `.forge/map/conventions.md` — project conventions
- `.forge/state/current.md` — current forge phase and last action

Summarize what was loaded:
```
Context loaded:
  Infrastructure:  [found | not found — /forge:map to generate]
  Stack:           [found | not found]
  Current phase:   [phase from state, or "none"]
```

## Step 3: Spawn forge-debugger agent

Spawn a `forge-debugger` subagent. Pass:
- `failure_description`
- Contents of `.forge/map/infra.md` (if found)
- Contents of `.forge/map/stack.md` (if found)
- Current working directory (project root)

The agent:
1. Reads `.forge/map/infra.md` to understand the system before diagnosing
2. Works through a structured checklist: Env → Config → Connectivity → Deps → Logs → Code
3. States a hypothesis at each layer before gathering evidence
4. Stops at the first confirmed suspect and reports it
5. Does NOT modify any files — read-only investigation
6. Writes `.forge/state/diagnose-[YYYY-MM-DD-HH-slug].md`

Wait for the agent to complete.

## Step 4: Display diagnosis report

Read the diagnosis report written by the agent.
Display it to the user in full.

## Step 5: Ask for confirmation

After displaying the report, use the AskUserQuestion tool with:
  - Yes, root cause found: The diagnosis identified the problem — proceed to fix options
  - No, still investigating: The diagnosis was inconclusive — next steps for further investigation
  - Partially — need more info: Something was identified but more investigation is needed

If the user selects "Other" and provides an explanation, read it carefully and determine
whether it represents a confirmed root cause, an inconclusive result, or a need for more
context. Ask a follow-up question if the intent is unclear.

If user selects "Yes, root cause found":
```
Root cause confirmed. Ready to fix?

Options:
  /forge:build   — if this needs a planned implementation
  Fix it now     — for simple fixes, just make the change
  /forge:fire    — if this turns out to be a production incident
```

If user selects "No, still investigating" or "Partially — need more info":
```
Diagnosis inconclusive. Options:

  1. Provide more context — paste error output, log lines, or describe
     what you've already tried
  2. Run /forge:diagnose again with a more specific description
  3. Check manually — the report should tell you where to look next
```

## Step 6: Write diagnosis entry to audit trail (if root cause found)

If user selected "Yes, root cause found", append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | diagnose:complete | forge | [failure_description] → .forge/state/diagnose-[slug].md |
```
