# Forge Promote Workflow

Elevate project-scoped instincts or skills to global scope.
This workflow is invoked by `/forge:promote`.

## What This Does

Moves a pattern from project scope (`.forge/instincts/` or `.forge/skills/`) to
global scope (`~/.claude/instincts/`), making it available in every project
on this machine.

Use this when a pattern transcends this project — it applies to your
development style, tech stack preferences, or working approach in general.

**Good candidates for promotion:**
- "Always check for existing utility functions before writing new ones"
- "Prefer named exports over default exports in TypeScript"
- "When using pnpm with tsc, pass --silent to pnpm not to tsc"

**Do NOT promote:**
- Database schema conventions specific to this project
- Error codes or endpoint paths specific to this service
- Patterns that reference project-specific file paths or names
- Anything that only makes sense in this codebase

## Step 1: Ensure global instincts directory exists

Check if `~/.claude/instincts/` exists. Create it if not.

## Step 2: List promotable patterns

Read:
- All files in `.forge/instincts/` with `**Status**: active` or `**Status**: evolved`
- All files in `.forge/skills/` (project-local skills created by /forge:evolve)

If none exist:
```
No project patterns found.

Run /forge:learn to capture patterns, then /forge:evolve to classify them.
You can then promote the general-purpose ones to global scope.
```
Stop.

Show the user a numbered list:
```
PROMOTABLE PATTERNS
══════════════════════════════════════════════════
Project instincts (.forge/instincts/):
[N items]

  1. [filename]
     Title: [instinct title]
     Trigger: [trigger line from file]
     Category: [category]

Project skills (.forge/skills/):
[N items]

  [N+1]. [filename]
     Title: [skill title]
     Trigger: [trigger line from file]

══════════════════════════════════════════════════
Which patterns are general enough to be useful in ALL projects?
Enter numbers (e.g. "1 3"), "all", or "none":
```

## Step 3: Wait for user selection

If "none": Tell user "No patterns promoted." Stop.
If numbers or "all": proceed with selected patterns.

## Step 4: Confirm each selection

For each selected pattern, show the content and ask:
```
Promoting: [title]

  Trigger: [trigger]
  Pattern: [pattern content — first 5 lines]

This will be available in ALL projects on this machine.
Is this general enough to promote? [y/n]
```

Only proceed with "y" responses. For "n" responses, skip silently.

If zero patterns were confirmed after asking:
```
No patterns confirmed for promotion.
```
Stop.

## Step 5: Write to global instincts

For each confirmed pattern, copy to `~/.claude/instincts/[slug].md`:

```markdown
# Instinct: [title]
**Promoted from**: [project name / path]
**Promoted at**: [ISO timestamp]
**Original file**: [source path]

## Trigger

[Trigger from source file]

## Pattern

[Pattern from source file]

## Example

[Example from source file]

## When NOT to Apply

[From source file]
```

If a file with the same slug already exists in `~/.claude/instincts/`, append
a short timestamp suffix to avoid overwriting: `[slug]-[HHMMSS].md`.

## Step 6: Mark source files as promoted

In each source file that was promoted:
- Change `**Status**: active` or `**Status**: evolved` → `**Status**: promoted`
- Add line: `**Promoted to**: ~/.claude/instincts/[filename]`
- Add line: `**Promoted at**: [ISO timestamp]`

## Step 7: Update global CLAUDE.md if needed

Read `~/.claude/CLAUDE.md`.

Check if it already references `~/.claude/instincts/` via an `@` include or a
section header.

If NOT already present, append to the end of `~/.claude/CLAUDE.md`:
```markdown

## Project Instincts (auto-promoted patterns)

The following patterns were promoted from individual projects and apply globally.
Check ~/.claude/instincts/ for the full list.

@~/.claude/instincts/
```

If already present, skip this step — do not duplicate the section.

Note: `@path` includes in CLAUDE.md are loaded automatically by Claude Code
at session start, making all promoted instincts available immediately.

## Step 8: Update audit trail

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | promote:global | forge | [N] instincts → ~/.claude/instincts/ |
```

## Step 9: Tell the user

```
PROMOTE COMPLETE
══════════════════════════════════════════════════
Promoted: [N] patterns to global scope

[List each: source file → ~/.claude/instincts/target.md]

These patterns are now active in all projects on this machine.
~/.claude/instincts/ now contains [total N] global instincts.

To verify: ls ~/.claude/instincts/
══════════════════════════════════════════════════
```
