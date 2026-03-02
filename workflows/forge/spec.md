# Forge Spec Workflow

Convert the locked decisions from the discuss phase into a structured PRD
with traceable requirement IDs. This document is the contract the build is held against.

This workflow is invoked by `/forge:spec`.

## Step 1: Load the discussion artifact

Read `.forge/state/current.md` to get the current task description and slug.

Look for `.forge/discuss/[task-slug]-discuss.md`.

If it does not exist:
  Tell the user:
  ```
  No discussion artifact found for the current task.
  Run /forge:discuss first to lock the implementation decisions.
  ```
  Stop.

Read the discussion artifact completely.

Tell the user: "Generating spec from discussion: [task description]..."

## Step 2: Generate the spec

Create a spec document using this structure:

```markdown
# Spec: [task title — clear, noun-phrase form]
**Status**: DRAFT
**Date**: [ISO timestamp]
**Derived from**: .forge/discuss/[task-slug]-discuss.md
**Slug**: [task-slug]

## Overview
[2-3 sentences: what this feature is, what problem it solves, who uses it.
No implementation details — just what it does from a user/system perspective.]

## Requirements

### REQ-001: [requirement title — verb phrase describing the capability]
**Description**: [What must be true when this is implemented. User-facing behavior or
system behavior, not implementation approach.]
**Acceptance Criteria**:
- [ ] [Specific, testable criterion. A passing automated test or a verifiable system state.]
- [ ] [Another criterion — be concrete. "The response includes..." is better than "works correctly"]
- [ ] [Another criterion]

### REQ-002: [requirement title]
**Description**: [...]
**Acceptance Criteria**:
- [ ] [...]

[Add as many REQ-NNN as needed. Each discrete capability or constraint gets its own REQ-NNN.
Typical range: 3-8 requirements per spec.]

## Out of Scope
[Explicit list of things this spec does NOT cover. This is important — it sets build boundaries.]
- [Feature or capability]: [brief reason — "deferred to next spec" or "conscious decision from discuss"]
- [Feature or capability]: [reason]

## Decisions (from discuss phase)
[Reference the key decisions that affect implementation. This gives the planner and executor context.]
- [Decision 1 title]: [the decision made and its rationale in one line]
- [Decision 2 title]: [the decision and rationale]

## Known Limitations
[Limitations that were consciously accepted during the discuss phase]
- [Limitation]: [description, and why it was accepted]

## Dependencies
[Anything that must be true for implementation to proceed]
- [dependency]: [description]
```

### REQ-NNN numbering rules:
- Start at REQ-001, increment sequentially
- Each distinct capability or testable behavior gets its own REQ-NNN
- Constraints (auth, rate limiting, error handling) each get their own REQ-NNN
- Do NOT merge multiple behaviors into one REQ-NNN

### Acceptance criteria rules:
- Each criterion must be independently testable with a passing automated test or verifiable state
- Start with: "The [system/endpoint/component] [verb] [specific observable behavior]"
- BAD: "Works correctly when authenticated"
- GOOD: "Returns HTTP 401 with body `{error: 'unauthorized'}` when no Authorization header is present"
- BAD: "Handles errors gracefully"
- GOOD: "Returns HTTP 422 with validation error details when the request body is missing required fields"

## Step 3: Present the spec for review

Show the full spec to the user.

Use the AskUserQuestion tool with:
  - Approve: The spec is correct — save it and proceed to planning
  - Request changes: Something needs to be revised — you will describe what to change
  - Back to discuss: Return to /forge:discuss to revisit implementation decisions

If the user selects "Other" and provides an explanation, read it carefully. If they describe
a specific change, treat it as "Request changes" and apply the revision directly. If they
describe a broader concern about the approach, treat it as "Back to discuss". Ask a
follow-up question if the intent is unclear.

## Step 4: Handle user response

### If user selects "Approve":

Update Status to APPROVED.
Write the spec to `.forge/specs/[task-slug]-SPEC.md`.

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | spec:approved | [user] | [task-slug]-SPEC.md |
```

Update `.forge/state/current.md`:
- **Current phase**: spec
- **Last action**: spec approved — [task-slug]-SPEC.md
- **Next action**: run /forge:plan to create the implementation graph
- **Last updated**: [ISO timestamp]

Tell the user:
```
Spec approved. Written to .forge/specs/[task-slug]-SPEC.md

Requirements defined: [REQ-001, REQ-002, ...]

Next: run /forge:plan to decompose this into an implementation graph.
```

### If user selects "Request changes":

Ask the user to describe what needs to change. Revise the specific section they describe.
Show the revised section only.

Use the AskUserQuestion tool with:
  - Looks good: Accept the revision and proceed to approve
  - Keep editing: There is more to change — describe what

Repeat until the user approves.
Then proceed with the approve flow above.

### If user selects "Back to discuss":

Tell the user: "OK. Run /forge:discuss to revisit the decisions."
Update `.forge/state/current.md`:
- **Current phase**: discuss
- **Last action**: returned to discuss from spec
- **Next action**: run /forge:discuss

### If user says the spec is missing something:

Ask: "Should we go back to /forge:discuss to address this, or add it directly to the spec here?"

If directly: add the requirement or section and re-present for approval.
If back to discuss: exit to discuss flow.
