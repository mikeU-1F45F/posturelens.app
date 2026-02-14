---
name: apply-pr-feedback
description: Implement requested changes from PR review in the same worktree. Use when human requests changes on a PR or when PR status shows CHANGES_REQUESTED.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Apply PR Feedback Skill

## Purpose
Implement requested changes from PR review in the same worktree.

## Prerequisites
- PR has CHANGES_REQUESTED status
- In worktree directory with feature branch
- Human provided feedback (via PR comments or direct instruction)

## Usage

```bash
# Start refinement workflow
/opencode/skill/apply-pr-feedback --pr 47

# With specific guidance
/opencode/skill/apply-pr-feedback --pr 47 \
  --feedback "Change variable name from 'foo' to 'postureThreshold'"
```

## Implementation

```bash
# 1. Fetch PR comments
COMMENTS=$(gh api repos/:owner/:repo/pulls/$PR_NUMBER/comments)

# 2. Pull latest from remote branch (in case human pushed commits)
git pull origin "$(git branch --show-current)"

# 3. Implement changes (manual or via feedback parsing)
# - Edit files based on feedback
# - Stage changes
# - Commit with "refactor:" or "fix:" prefix

# 4. Push updates
git push origin "$(git branch --show-current)"

# 5. Add comment to PR
gh pr comment "$PR_NUMBER" --body "Changes applied as requested"
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--pr` | Yes | PR number |
| `--feedback` | No | Direct feedback text (if not from PR comments) |
| `--auto-apply` | No | Attempt to auto-apply simple changes |

## Output

```
[AGENT-xxx] HH:MM:SS Fetching PR #47 comments...
[AGENT-xxx] HH:MM:SS Found 2 review comments
[AGENT-xxx] HH:MM:SS Pulling latest from remote branch...
[AGENT-xxx] HH:MM:SS Implementing requested changes...
[AGENT-xxx] HH:MM:SS   - Applied: Changed variable name 'foo' to 'postureThreshold'
[AGENT-xxx] HH:MM:SS   - Applied: Added error handling for null case
[AGENT-xxx] HH:MM:SS Committing changes...
[AGENT-xxx] HH:MM:SS Pushing updates to PR #47...
[AGENT-xxx] HH:MM:SS PR updated - waiting for re-review
```

## Workflow

1. **Check Status**: Verify PR has CHANGES_REQUESTED
2. **Fetch Comments**: Get review feedback from GitHub
3. **Sync Branch**: Pull any commits human may have added
4. **Implement**: Make requested changes in worktree
5. **Commit**: Use descriptive commit message
6. **Push**: Update PR branch
7. **Notify**: Comment on PR that changes are applied
8. **Handoff**: Back to human for re-review

## Exit Codes

- 0: Changes applied and pushed
- 1: Not in worktree or on wrong branch
- 2: PR not in CHANGES_REQUESTED state
- 3: Push failed
