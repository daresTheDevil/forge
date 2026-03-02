# Forge Drift Workflow

Detect divergence between the project map and the actual codebase state.
This workflow is invoked by `/forge:drift`.

## Step 1: Verify map exists

Check for `.forge/map/project-graph.json` and `.forge/map/map.md`.

If neither exists:
```
No project map found.

Run /forge:map first to initialize the project map,
then make changes, then run /forge:drift to check for drift.
```
Stop.

Read `.forge/map/project-graph.json` to get the list of tracked entities.
Read `.forge/map/map.md` to get the generation timestamp.

## Step 2: Extract the map timestamp

From `map.md`, read the `**Generated**:` line and parse it as an ISO timestamp.
This is the `map_generated_at` reference point.

Calculate age: how many days ago was this relative to now?

Tell the user:
```
Checking drift since [map_generated_at] ([N] days ago)...
```

## Step 3: Parse tracked paths from project-graph.json

Read `.forge/map/project-graph.json`. Extract every file path referenced:
- In `entities[*].file` or `entities[*].path` fields
- In `entities[*].entryPoints` arrays (if present)
- In `relationships[*].source` and `relationships[*].target` (if they look like paths)

Build a deduplicated list of `tracked_paths` — all concrete file paths in the graph.
Skip entries that look like service names or abstract concepts (no `/` or extension).

## Step 4: Scan for STALE entities

For each `tracked_path` in the entity list:
1. Check if the file/directory exists at that path (relative to project root)
2. If it does NOT exist → mark as **STALE**

STALE means: the map references something that no longer exists in the codebase.

## Step 5: Scan for OUTDATED files

For each `tracked_path` that does exist:
1. Get the file's last-modified timestamp
2. Compare to `map_generated_at`
3. If the file was last modified AFTER `map_generated_at` → mark as **OUTDATED**

OUTDATED means: the file changed after the map was generated — the map may
not reflect its current structure, exports, or behavior.

## Step 6: Scan for NEW files

Scan these directories for source files not referenced in `tracked_paths`:
- `src/`, `lib/`, `server/src/`, `agents/`, `workflows/`, `commands/`
- Root-level `.ts`, `.js`, `.py`, `.go`, `.rs`, `.php` files

Skip: `node_modules/`, `.git/`, `dist/`, `build/`, `.cache/`, `.forge/`,
`coverage/`, `__pycache__/`, `.next/`, `.nuxt/`, `vendor/`, `target/`

For each source file found that does NOT appear in `tracked_paths`:
→ mark as **NEW**

NEW means: this file exists in the codebase but has never been mapped.

## Step 7: Calculate totals and display

Count:
- `stale_count` — entities in map with missing paths
- `outdated_count` — files changed since map generation
- `new_count` — files not yet in map
- `total_issues` = stale + outdated + new

If `total_issues` is 0:
```
No drift detected.
══════════════════════════════════════════════════
Map generated: [map_generated_at] ([N] days ago)
Tracked:       [N] entities
Status:        CLEAN — map is in sync with the codebase
══════════════════════════════════════════════════
```
Skip to Step 9 (write clean report + audit trail).

Otherwise, display:
```
DRIFT DETECTED
══════════════════════════════════════════════════
Map generated: [map_generated_at] ([N] days ago)
Tracked:       [N] entities

  STALE    (in map, file gone):      [N]
  OUTDATED (modified since map):     [N]
  NEW      (not yet in map):         [N]
══════════════════════════════════════════════════

STALE (map references files that no longer exist)
  [path] — [entity name or type]
  [path] — [entity name or type]

OUTDATED (files changed since map was generated)
  [path] — modified [X days ago] (map is [Y days] old)
  [path] — modified [X days ago]

NEW (source files not yet in map)
  [path]
  [path]

Recommendation: Run /forge:map to regenerate the project map.
══════════════════════════════════════════════════
```

## Step 8: Write drift report

Write `.forge/state/drift-report.md`:

```markdown
# Drift Report
**Generated**: [ISO timestamp]
**Map generated at**: [map_generated_at]
**Status**: [CLEAN | DRIFT DETECTED]

## Summary
| Category | Count |
|---|---|
| STALE (missing paths) | [N] |
| OUTDATED (changed since map) | [N] |
| NEW (not in map) | [N] |
| Total issues | [N] |

## STALE — Entities in Map with Missing Paths

[If none: "None detected."]

| Path | Entity Name |
|---|---|
| [path] | [name] |

## OUTDATED — Files Modified Since Map Generation

[If none: "None detected."]

| Path | Last Modified | Days Since Map |
|---|---|---|
| [path] | [timestamp] | [N] |

## NEW — Source Files Not in Map

[If none: "None detected."]

- `[path]`
- `[path]`

## Recommendation

[If CLEAN: "Map is in sync. No action needed."]
[If DRIFT: "Run /forge:map to regenerate the project map and resolve drift."]
```

## Step 9: Update audit trail

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | drift:checked | forge | .forge/state/drift-report.md |
```

Tell the user:
```
Drift report written to .forge/state/drift-report.md
```
