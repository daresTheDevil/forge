# Forge Learn Workflow

Extract patterns from the current session into project-scoped instincts.
This workflow is invoked by `/forge:learn`.

## What This Does

Reads the session history and identifies reusable patterns — decisions made,
workarounds applied, conventions established, anti-patterns discovered.
Writes each selected pattern as a structured instinct file to `.forge/instincts/`.

Instincts are automatically available to future sessions, making forge
progressively smarter about your specific project.

## Step 1: Ensure instincts directory exists

Create `.forge/instincts/` if it does not exist.

## Step 2: Gather session context

Read the following sources to reconstruct what happened this session:

1. `.forge/compliance/audit-trail.md` — action history (last 30 entries)
2. `.forge/state.json` — current task (`task`), phase (`phase`), and last action (`last_action`)
3. `.forge/plans/` — list all files; read any `*-SUMMARY.md` and `*-BLOCKED.md`
4. `.forge/specs/` — list spec files; read the most recent one
5. `.forge/instincts/` — list existing instinct filenames (to check for duplicates)
6. The current conversation context — what problems were solved, what decisions were made

## Step 3: Identify candidate patterns

Analyze the gathered context. Look for patterns across these categories:

**Architectural decisions**
- "We chose X over Y for reason Z"
- "Files of type X always go in directory Y"
- "This project structures responses as X"

**Recurring workarounds**
- "Tool X doesn't work with flag --Y in this project, use --Z instead"
- "Service X always needs environment variable Y to be set first"
- "Build step X must run before Y or the output is stale"

**Testing patterns**
- "Tests in this project mock X using approach Y"
- "Integration tests require Z to be running (check with command W)"
- "Test file naming convention: *.test.ts next to the source file"

**Anti-patterns discovered**
- "Don't use pattern X in this codebase because Y breaks"
- "Avoid library Z — it conflicts with W in this project"

**Naming and convention discoveries**
- "Database columns in this project use camelCase not snake_case"
- "Error codes follow format ERR-SERVICE-NNN"
- "Exported functions use verb-first naming: parseX, buildY, formatZ"

**Gotchas specific to this project**
- "Package manager is pnpm, not npm or bun"
- "The dev server on port 3000 conflicts with X — use port 3001"

## Step 4: Check for duplicates

For each candidate, check the filenames in `.forge/instincts/`. If an instinct
with a very similar title already exists, skip the duplicate and note it.

## Step 5: Present candidates to user

If no candidates were found:
```
No new patterns detected from this session.

The session may not have produced enough context for pattern extraction,
or all patterns are already captured in .forge/instincts/.

Run /forge:learn after a build session that involved decisions and tradeoffs.
```
Stop.

Otherwise show:
```
CANDIDATE INSTINCTS
══════════════════════════════════════════════════
Found [N] patterns from this session:

1. [Pattern title]
   Category: [Workaround | Convention | Anti-pattern | Architecture | Testing | Gotcha]
   Trigger:  [When Claude should apply or recall this]
   Pattern:  [One-sentence summary of the pattern]

2. [Pattern title]
   Category: [...]
   Trigger:  [...]
   Pattern:  [...]

[...and so on...]
══════════════════════════════════════════════════
Which patterns should be saved?
Enter numbers (e.g. "1 3 4"), "all", or "none":
```

## Step 6: Wait for user selection

Wait for user input.

If "none": Tell user "No instincts saved." Stop.
If "all": Save all candidates.
If numbers: Save only the listed items (comma or space separated).

## Step 7: Write instinct files

For each selected pattern, write `.forge/instincts/[YYYY-MM-DD-HH-slug].md`:

```markdown
# Instinct: [pattern title]
**Created**: [ISO timestamp]
**Category**: [Workaround | Convention | Anti-pattern | Architecture | Testing | Gotcha]
**Source**: [brief description of the session that produced this — e.g. "build session: auth endpoint refactor"]
**Status**: active

## Trigger

[When should Claude apply or recall this pattern? Be specific about the context.
Examples:
- "When running pnpm commands in the server/ directory..."
- "When writing tests for API routes in this project..."
- "When someone suggests using npm instead of pnpm..."]

## Pattern

[The actual pattern, decision, or convention. Write it as a direct instruction.
Examples:
- "Use pnpm --silent build (not pnpm build --silent) — the flag position matters to pnpm"
- "Always mock the database connection using the project's test helpers in tests/helpers/db.ts"
- "Do not use the default export pattern — this project uses named exports exclusively"]

## Example

[A concrete example from this session that illustrates the pattern.
Include file paths or command output if relevant.]

## When NOT to Apply

[Conditions under which this pattern should be skipped or overridden.
If always applicable, write "Always apply in this project."]
```

Slug format: `YYYY-MM-DD-HH-kebab-case-title`
Example: `2026-03-02-18-prefer-pnpm-not-npm.md`

## Step 8: Update audit trail

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | learn:captured | forge | [N] instincts → .forge/instincts/ |
```

## Step 9: Tell the user

```
LEARN COMPLETE
══════════════════════════════════════════════════
Instincts saved: [N]

[List each saved file with its title]

Next steps:
  /forge:evolve  — classify instincts into commands, skills, or agents
  /forge:promote — elevate project instincts to global scope
══════════════════════════════════════════════════
```
