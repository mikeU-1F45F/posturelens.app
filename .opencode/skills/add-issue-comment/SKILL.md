---
name: add-issue-comment
description: Post progress updates, blockers, or questions to a GitHub issue. Use when providing status updates, asking clarifying questions, or reporting blockers during implementation.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Add Issue Comment Skill

## Purpose
Post progress updates, blockers, or questions to a GitHub issue.

## Prerequisites
- GitHub CLI authenticated
- Issue number known
- `AGENT_ID` environment variable set

## Usage

```bash
# Add simple comment
/opencode/skill/add-issue-comment --issue 23 --message "Started implementation"

# Add structured progress update
/opencode/skill/add-issue-comment --issue 23 --progress \
  --completed "Created alert sound assets, Integrated with alert engine" \
  --blocked "Need clarification on user-configurable vs hardcoded"
```

## Implementation

```bash
# Simple comment
gh issue comment "$ISSUE_NUMBER" --body "$MESSAGE"

# Structured progress comment (when --progress flag used)
COMMENT="## Progress Update

**Claimed by**: $AGENT_ID  
**Worktree**: \`$WORKTREE_PATH\`  
**Branch**: \`$BRANCH_NAME\`

### Completed
$COMPLETED_ITEMS

### Blocked
$BLOCKED_ITEMS

### Next Steps
$NEXT_STEPS"

gh issue comment "$ISSUE_NUMBER" --body "$COMMENT"
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--issue` | Yes | Issue number |
| `--message` | No | Simple text message |
| `--progress` | No | Flag for structured progress format |
| `--completed` | No | Completed items (comma-separated) |
| `--blocked` | No | Blockers/questions |
| `--next-steps` | No | What happens next |

## Output

```
[AGENT-xxx] HH:MM:SS Adding comment to issue #23...
[AGENT-xxx] HH:MM:SS Comment posted: https://github.com/.../issues/23#issuecomment-xxx
```

## Error Handling

| Error | Action |
|-------|--------|
| Issue not found | Log error, exit 1 |
| Comment failed | Log error details, exit 2 |
