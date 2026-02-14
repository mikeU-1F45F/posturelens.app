---
name: cleanup-worktree
description: Remove worktree and delete remote branch after PR is merged. Use when human confirms cleanup is safe after PR merge and worktree is no longer needed.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Cleanup Worktree Skill

## Purpose
Remove worktree and delete remote branch after PR is merged.

## Prerequisites
- PR has been merged
- Human confirms cleanup is safe
- `AGENT_ID` environment variable set

## Usage

```bash
# Full cleanup
/opencode/skill/cleanup-worktree --issue 23 --confirm

# Preview what would be cleaned up
/opencode/skill/cleanup-worktree --issue 23 --dry-run
```

## Implementation

```bash
# Verify PR is merged
PR_STATE=$(gh pr view "$PR_NUMBER" --json merged --jq '.merged')
if [[ "$PR_STATE" != "true" ]]; then
  echo "ERROR: PR #$PR_NUMBER is not merged yet"
  exit 1
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Would remove worktree: ~/Work/posturelens-agent-{id}-$ISSUE_NUMBER"
  echo "Would delete branch: feature/issue-$ISSUE_NUMBER-{desc}"
  exit 0
fi

if [[ "$CONFIRM" != "true" ]]; then
  echo "WARNING: This will delete worktree and branch"
  echo "Use --confirm to proceed"
  exit 1
fi

# Remove worktree
cd ~/Work/posturelens.app
git worktree remove "../posturelens-agent-{id}-$ISSUE_NUMBER"

# Delete remote branch
git push origin --delete "feature/issue-$ISSUE_NUMBER-{desc}"

# Delete local branch ref
git branch -D "feature/issue-$ISSUE_NUMBER-{desc}"
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--issue` | Yes | Issue number |
| `--confirm` | No | Confirm deletion (required for actual cleanup) |
| `--dry-run` | No | Preview what would be deleted |

## Output

On success:
```
[AGENT-xxx] HH:MM:SS Verifying PR #$PR_NUMBER is merged...
[AGENT-xxx] HH:MM:SS PR is merged - safe to cleanup
[AGENT-xxx] HH:MM:SS Removing worktree ~/Work/posturelens-agent-xxx-23...
[AGENT-xxx] HH:MM:SS Worktree removed
[AGENT-xxx] HH:MM:SS Deleting remote branch feature/issue-23-add-audio...
[AGENT-xxx] HH:MM:SS Remote branch deleted
[AGENT-xxx] HH:MM:SS Cleanup complete - worktree freed
```

On dry-run:
```
[AGENT-xxx] HH:MM:SS DRY RUN - Would cleanup:
[AGENT-xxx] HH:MM:SS   - Worktree: ~/Work/posturelens-agent-xxx-23
[AGENT-xxx] HH:MM:SS   - Branch: feature/issue-23-add-audio
[AGENT-xxx] HH:MM:SS Use --confirm to execute
```

## Safety Checks

- Verifies PR is merged before allowing deletion
- Requires explicit --confirm flag
- Supports --dry-run for preview
- Cannot delete main worktree

## Exit Codes

- 0: Cleanup successful
- 1: PR not merged
- 2: Worktree not found
- 3: Deletion failed
