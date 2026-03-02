# Forge Evolve Workflow

Classify accumulated instincts into commands, skills, or agents.
This workflow is invoked by `/forge:evolve`.

## What This Does

Reads all active instinct files in `.forge/instincts/` and classifies each one
into the type of artifact it should become:

- **Command** — a new `/forge:` slash command
- **Skill** — a behavior file that auto-applies to a category of work
- **Agent** — a new subagent for multi-step autonomous execution
- **Discard** — one-time workaround that won't recur

This is the compounding knowledge loop:
```
session → /forge:learn → /forge:evolve → /forge:promote → global scope
```

## Step 1: Load active instincts

Read all files in `.forge/instincts/` that have `**Status**: active`.
Skip files with `**Status**: evolved`, `**Status**: discarded`, or `**Status**: promoted`.

If no active instincts exist:
```
No active instincts found in .forge/instincts/.

Run /forge:learn first to capture patterns from a session,
then run /forge:evolve to classify them.
```
Stop.

## Step 2: Classify each instinct

For each active instinct, analyze its `## Trigger` and `## Pattern` sections.
Apply these classification rules:

**Command candidate** if:
- The trigger describes something the user explicitly requests by name
- It is a complex multi-step sequence that always follows the same path
- A person would plausibly say "run X" or "do X" as a command
- Examples: "generate a database migration", "run the release checklist"

**Skill candidate** if:
- The trigger is a conditional: "whenever working on X..." or "before doing Y..."
- It is a constraint or convention that shapes how Claude behaves, not what it produces
- It should activate automatically without the user saying anything
- Examples: "always check for duplicate utils before writing new ones",
  "never use npm in this project — always pnpm"

**Agent candidate** if:
- The pattern requires multi-step autonomous execution with its own scope
- It operates on defined inputs and produces a specific output artifact
- It would be too complex to describe as a single skill instruction
- Examples: "scan all API routes and produce a coverage report",
  "analyze the test suite and flag untested public functions"

**Discard** if:
- The pattern was a one-time fix that cannot recur
- It is already captured in CLAUDE.md, an existing workflow, or an existing skill
- It is too project-specific to be useful more than once
- Examples: "run `pnpm install` after the first clone" (one-time),
  "the auth bug on line 47 was caused by X" (fixed, won't repeat)

## Step 3: Present classification to user

Show:
```
INSTINCT CLASSIFICATION
══════════════════════════════════════════════════
Analyzed [N] active instincts:

1. [Instinct title]
   File: .forge/instincts/[filename]
   Classification: [SKILL | COMMAND | AGENT | DISCARD]
   Reason: [One sentence explaining the classification]
   [If COMMAND: Proposed command: /forge:[name] → workflows/forge/[name].md]
   [If SKILL:   Proposed file: .forge/skills/[slug].md]
   [If AGENT:   Proposed file: agents/forge-[slug].md]
   [If DISCARD: Discard reason: [why it won't recur]]

2. [Instinct title]
   ...

══════════════════════════════════════════════════

Use the AskUserQuestion tool with:
  - Accept all: All classifications look correct — proceed to generate artifacts
  - Review each one: Walk through each classification individually before committing
  - Override some: Apply specific manual overrides (you will specify which to change)

If the user selects "Other" and provides an explanation, read it carefully. If they specify
overrides in the format `N:type` (e.g., "1:agent 3:skill"), apply those corrections directly.
If they describe a concern about a specific item, address it. Ask a follow-up question if
the intent is unclear.

## Step 4: Apply overrides if needed

If user selected "Review each one":
  Walk through each instinct individually, showing the proposed classification.
  For each, confirm with the user or accept a different classification before proceeding.

If user selected "Override some":
  Ask: "Which ones to override? (e.g. '1:agent 3:skill 4:discard'):"
  Wait for input. Apply the corrections.

Proceed to Step 5 after all classifications are finalized.

## Step 5: Generate artifacts

For each classification:

### COMMAND

1. Write the command stub at `commands/forge/[name].md`:
```markdown
---
description: "[description from instinct title]"
---

@~/.claude/workflows/forge/[name].md
```

2. Write the workflow file at `workflows/forge/[name].md`:
```markdown
# Forge [Name] Workflow

[Pattern content from the instinct — expand it into full workflow steps]

This workflow is invoked by `/forge:[name]`.

## Step 1: [First step derived from the pattern]
...
```

3. Mark the instinct file:
   - Change `**Status**: active` → `**Status**: evolved`
   - Add line: `**Evolved to**: command — commands/forge/[name].md`

### SKILL

1. Write the skill file at `.forge/skills/[slug].md`:
```markdown
# Skill: [instinct title]
**Trigger**: [trigger from instinct — when this applies]
**Scope**: this project

[Pattern content as direct instructions for Claude]

## When NOT to Apply

[from instinct's "When NOT to Apply" section]
```

2. Mark the instinct:
   - `**Status**: evolved`
   - `**Evolved to**: skill — .forge/skills/[slug].md`

### AGENT

1. Write the agent stub at `agents/forge-[slug].md` using the standard agent format:
```markdown
# forge-[slug]

You are forge-[slug], [role derived from instinct pattern].

## Your Job

[Pattern content expanded into agent instructions]

## Inputs You Receive

[What the workflow should pass to this agent]

## Output

[What this agent produces — files written, summary format]
```

2. Mark the instinct:
   - `**Status**: evolved`
   - `**Evolved to**: agent — agents/forge-[slug].md`

### DISCARD

1. Mark the instinct:
   - `**Status**: discarded`
   - Add line: `**Discarded at**: [ISO timestamp]`
   - Add line: `**Discarded reason**: [reason]`

## Step 6: Update audit trail

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | evolve:classified | forge | [N] instincts → [Nc commands, Ns skills, Na agents, Nd discarded] |
```

## Step 7: Tell the user

```
EVOLVE COMPLETE
══════════════════════════════════════════════════
Commands created:  [N]  [list names]
Skills created:    [N]  [list names]
Agents created:    [N]  [list names]
Discarded:         [N]

[For each created artifact, show the file path]

If you created new commands or agents, run:
  bash install.sh   — to deploy them to ~/.claude/

Use /forge:promote to elevate project skills to global scope.
══════════════════════════════════════════════════
```
