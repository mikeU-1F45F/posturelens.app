---
name: update-project-status
description: Move a GitHub Project board item to a different status column. Use when transitioning work between states (In Progress, In Review, etc).
metadata:
  author: posturelens-team
  version: "1.0"
---

# Update Project Status Skill

## Purpose
Move a GitHub Project board item to a different status column.

## Prerequisites
- GitHub CLI authenticated
- Project item ID and field IDs known
- `AGENT_ID` environment variable set

## Usage

```bash
# Move to In Progress after claiming
/opencode/skill/update-project-status --item-id PVTI_xxx --status "In Progress"

# Move to In Review after PR creation
/opencode/skill/update-project-status --item-id PVTI_xxx --status "In Review"
```

## Implementation

Uses GraphQL mutation to update single-select field:

```bash
# Get field IDs first
gh project field-list 3 --owner "@me" --format json

# Update status
gh project item-edit \
  --id "$ITEM_ID" \
  --field-id "$STATUS_FIELD_ID" \
  --project-id "$PROJECT_ID" \
  --single-select-option-id "$STATUS_OPTION_ID"
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--item-id` | Yes | Project item ID (PVTI_xxx) |
| `--status` | Yes | Target status: "In Progress" or "In Review" |
| `--project-id` | No | Defaults to project #3 |

## Output

```
[AGENT-xxx] HH:MM:SS Moving item PVTI_xxx to "In Progress"...
[AGENT-xxx] HH:MM:SS Status updated successfully
```

## Error Handling

| Error | Action |
|-------|--------|
| Invalid status | Log error, exit 1 |
| Item not found | Log error, exit 2 |
| GraphQL failure | Log error details, exit 3 |
