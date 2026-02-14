---
name: sync-with-main
description: Pull latest changes from main into current worktree branch. Use before creating a PR to ensure branch is up to date with main.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Sync with Main Skill

## Purpose
Pull latest changes from main into current worktree branch.

## Prerequisites
- In worktree directory
- On feature branch (not main)

## Usage

```bash
# Sync before creating PR
/opencode/skill/sync-with-main

# Sync with rebase (for clean history)
/opencode/skill/sync-with-main --rebase
```

## Implementation

```bash
# Fetch latest
git fetch origin main

# Merge or rebase
if [[ "$USE_REBASE" == "true" ]]; then
  git rebase origin/main
else
  git merge origin/main
fi

# Check for conflicts
if [[ -n $(git status --porcelain | grep "^UU") ]]; then
  echo "CONFLICTS DETECTED - Manual resolution required"
  exit 1
fi
```

## Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--rebase` | No | false | Use rebase instead of merge |
| `--push` | No | false | Push after successful sync |

## Output

```
[AGENT-xxx] HH:MM:SS Fetching latest from origin/main...
[AGENT-xxx] HH:MM:SS Merging into feature/issue-23-add-audio-alerts...
[AGENT-xxx] HH:MM:SS Sync complete - 3 files updated
```

## Error Handling

| Error | Action |
|-------|--------|
| Not on feature branch | Log error, exit 1 |
| Conflicts | Log conflict files, exit 2 |
| Push failed | Log error, exit 3 |
