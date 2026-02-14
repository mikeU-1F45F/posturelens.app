---
name: pull-main-updates
description: After a blocking PR is merged, pull the latest main into dependent worktree. Use when starting work on dependent issue after blocking PR is merged.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Pull Main Updates Skill

## Purpose
After a blocking PR is merged, pull the latest main into dependent worktree.

## Prerequisites
- In dependent worktree directory
- Blocking PR has been merged
- On feature branch (not main)

## Usage

```bash
# Pull latest main updates
/opencode/skill/pull-main-updates --blocking-pr 43

# With rebase for clean history
/opencode/skill/pull-main-updates --blocking-pr 43 --rebase
```

## Implementation

```bash
# 1. Verify blocking PR is merged
BLOCKING_MERGED=$(gh pr view "$BLOCKING_PR" --json merged --jq '.merged')
if [[ "$BLOCKING_MERGED" != "true" ]]; then
  echo "ERROR: Blocking PR #$BLOCKING_PR is not merged yet"
  exit 1
fi

# 2. Fetch latest main
git fetch origin main

# 3. Merge or rebase main into current branch
if [[ "$USE_REBASE" == "true" ]]; then
  git rebase origin/main
else
  git merge origin/main --no-edit
fi

# 4. Check for conflicts
if [[ -n $(git status --porcelain | grep "^UU") ]]; then
  echo "CONFLICTS DETECTED"
  echo "Files with conflicts:"
  git status --porcelain | grep "^UU" | cut -c4-
  exit 1
fi

# 5. Push updated branch
git push origin "$(git branch --show-current)"

echo "Main updates pulled successfully"
echo "Dependent worktree now includes changes from PR #$BLOCKING_PR"
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--blocking-pr` | Yes | PR number that was merged (blocking issue) |
| `--rebase` | No | Use rebase instead of merge |
| `--push` | No | Push after successful pull (default true) |

## Output

```
[AGENT-xxx] HH:MM:SS Verifying blocking PR #43 is merged...
[AGENT-xxx] HH:MM:SS PR #43 is merged - proceeding with update
[AGENT-xxx] HH:MM:SS Fetching latest main...
[AGENT-xxx] HH:MM:SS Merging main into feature/issue-45-audio-alerts...
[AGENT-xxx] HH:MM:SS Merge successful - 2 files updated
[AGENT-xxx] HH:MM:SS Pushing updated branch...
[AGENT-xxx] HH:MM:SS Dependent worktree now ready for implementation
```

## Workflow

1. **Verify**: Confirm blocking PR is merged
2. **Fetch**: Get latest main from origin
3. **Merge**: Bring main changes into feature branch
4. **Resolve**: Handle any conflicts (manual if needed)
5. **Push**: Update remote branch with merged changes
6. **Proceed**: Continue with dependent work

## Exit Codes

- 0: Updates pulled and pushed successfully
- 1: Blocking PR not merged
- 2: Not in worktree or on wrong branch
- 3: Conflicts detected (manual resolution needed)
- 4: Push failed
