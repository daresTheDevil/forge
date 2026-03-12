# Forge Discuss Workflow

Structured conversation to surface gray areas and lock implementation decisions
before writing a spec. Every decision made here flows directly into the spec.

This workflow is invoked by `/forge:discuss`.

## Step 1: Load context

Read `.forge/state.json` to get the current task description (field: `task`).

If `.forge/state.json` does not exist or `task` is `null`:
  Tell the user:
  ```
  No active task found. Run /forge:recon [task description] first.
  ```
  Stop.

Read the recon brief from `.forge/discuss/[task-slug]-recon.md` if it exists.
If no recon brief exists, proceed without it — but flag that recon would improve this session.

Tell the user:
```
Starting discuss phase for: [current task]
[If recon brief found: "Loaded recon context: [N] relevant files, [N] open questions identified"]
[If no recon brief: "No recon brief found. Consider running /forge:recon first for better context."]
```

## Step 2: Scout the codebase for reusable assets

Before asking any questions, spend time reading the codebase to find:
- Existing patterns that are directly relevant to this feature
- Reusable utilities, helpers, or services the implementation can leverage
- Potential conflicts with existing code
- Integration points (what calls what)

Search for:
- Existing similar features (to use as implementation pattern reference)
- Relevant database models or schema (if data is involved)
- Existing tests in the area (to understand test style and coverage)
- Any TODO comments or known issues in the relevant code areas

Report findings to the user:
```
Codebase scout results:
- Found [N] relevant existing patterns
- [Key finding 1: e.g., "Existing CSV export in src/reports/ uses the csv-writer library"]
- [Key finding 2: e.g., "Auth middleware is in src/middleware/auth.ts — requireAuth function"]
- [Key finding 3: e.g., "No existing tests for the reports module — will need to create test setup"]

I found these reusable assets:
- [asset 1]: [what it is, where it is, how it could be used]
- [asset 2]: [what it is, where it is]
```

## Step 3: Identify gray areas

Based on the task description, codebase findings, and recon brief, identify 3-4 specific
decisions that need to be made. These must be:

- Concrete to THIS feature, not generic engineering questions
- Decision points where the answer meaningfully changes implementation
- Things where there's no obvious right answer (otherwise just decide and document it)

BAD gray areas:
- "How should we handle errors?" (too generic)
- "Should we write tests?" (always yes)
- "What language should we use?" (already decided)

GOOD gray areas:
- "The user endpoint returns `{code, message}` but the export feature needs to return binary data.
  Should the export be a streaming response or buffer-then-send? Streaming is better for large
  datasets but harder to test; buffering is simpler but has a memory ceiling."
- "The spec doesn't mention pagination. With 50k users, a single CSV export will be 8MB. Should
  we add a date-range filter now, or ship the simple version and add filtering in the next spec?"
- "Two auth middleware functions exist: requireAuth (session-based) and requireApiKey (token-based).
  Which should the export endpoint use? The UI uses sessions; third-party integrations use API keys."

## Step 4: Work through each gray area one at a time

For each gray area:

1. Present the specific decision needed with full context. Show the relevant code if applicable.
2. Show the 2-3 options with their specific implications for this codebase.
3. State your recommendation if you have one, with reasoning.
4. Wait for the user to respond.
5. Challenge weak decisions:
   - If the user picks the harder option without acknowledging the complexity: "That approach
     works, but [specific complexity]. Are you sure that's worth it for this feature?"
   - If the user picks the simpler option but it has a real downside: "OK, just to confirm:
     [downside]. That's fine for now, but document it in the spec as a known limitation?"
6. Lock the decision: "DECISION: [what was decided — one sentence]"
7. Move to the next gray area.

Do not ask about all gray areas at once. One at a time, wait for response, then proceed.

## Step 5: Summarize all decisions

After all gray areas have locked decisions, summarize:
```
All decisions locked:

1. [Gray area]: [Decision]
2. [Gray area]: [Decision]
3. [Gray area]: [Decision]
[...]

Any of these need revisiting before we write the spec?
```

If the user wants to revisit, re-run the specific gray area.

## Step 6: Write the discussion artifact

Write `.forge/discuss/[task-slug]-discuss.md`:

```markdown
# Discussion: [task description]
**Date**: [ISO timestamp]
**Task**: [full task description]
**Recon brief**: [.forge/discuss/[task-slug]-recon.md | not available]

## Codebase Findings

### Reusable Assets Found
- [asset]: [path] — [description]
- [asset]: [path] — [description]

### Integration Points
- [integration point]: [description]

### Potential Issues
- [issue]: [description]

## Decisions Made

### [Gray Area 1 title]
**Context**: [what the issue was and why it matters]
**Options considered**:
  - Option A: [description] — [implication]
  - Option B: [description] — [implication]
**Decision**: [what was decided]
**Rationale**: [why]

### [Gray Area 2 title]
**Context**: [...]
**Decision**: [...]
**Rationale**: [...]

[Repeat for each gray area]

## Known Limitations Accepted
[Decisions where a simpler approach was chosen and the limitation was consciously accepted]
- [limitation]: [accepted by user, will be documented in spec Out of Scope]
```

## Step 7: Update state and tell user what to do next

Update `.forge/state.json`: set `phase` to `"discuss"`, set `last_action` to `"discuss phase complete — [N] decisions locked"`, set `next_action` to `"run /forge:spec to create the requirements document"`, set `updated_at` to `"[ISO timestamp of now]"`.

Tell the user:
```
[N] decisions locked. Discussion artifact written to .forge/discuss/[task-slug]-discuss.md

Next: run /forge:spec to convert these decisions into a formal requirements document.
```

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | discuss:completed | [user] | [task-slug] |
```
