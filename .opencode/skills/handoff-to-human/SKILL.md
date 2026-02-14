---
name: handoff-to-human
description: Finalize agent work, create PR, move to In Review, and notify human. Use when implementation is complete and ready for human review.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Handoff to Human Skill

## Purpose
Finalize agent work, create PR, move to In Review, and notify human.

## Prerequisites
- In worktree directory
- Changes committed
- Issue claimed and in In Progress
- `AGENT_ID` environment variable set

## Usage

```bash
# Complete workflow and handoff
/opencode/skill/handoff-to-human \
  --issue 23 \
  --title "Add audio alert system" \
  --description "Implements configurable audio alerts for posture violations"
```

## Implementation

```bash
# 1. Push current branch
git push -u origin "$(git branch --show-current)"

# 2. Create PR
PR_URL=$(gh pr create \
  --base main \
  --head "$(git branch --show-current)" \
  --title "$PR_TITLE" \
  --body "$PR_BODY")

# 3. Extract PR number
PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')

# 4. Move to In Review
gh project item-edit \
  --id "$PROJECT_ITEM_ID" \
  --field-id "$STATUS_FIELD_ID" \
  --project-id "$PROJECT_ID" \
  --single-select-option-id "$IN_REVIEW_OPTION_ID"

# 5. Add comment to issue
gh issue comment "$ISSUE_NUMBER" --body "PR #$PR_NUMBER created for review: $PR_URL"

# 6. Log handoff
[AGENT-xxx] HH:MM:SS PR created: $PR_URL
[AGENT-xxx] HH:MM:SS Moving to "In Review", waiting for human review...
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--issue` | Yes | Issue number |
| `--title` | Yes | PR title |
| `--description` | Yes | PR description body |
| `--closes` | No | Auto-add "Closes #N" (default true) |

## Output

```
[AGENT-xxx] HH:MM:SS Pushing branch feature/issue-23-add-audio-alerts...
[AGENT-xxx] HH:MM:SS Creating PR...
[AGENT-xxx] HH:MM:SS PR created: https://github.com/.../pull/47
[AGENT-xxx] HH:MM:SS Moving to "In Review"...
[AGENT-xxx] HH:MM:SS Comment added to issue #23
[AGENT-xxx] HH:MM:SS Worktree preserved at ~/Work/posturelens-agent-xxx-23
[AGENT-xxx] HH:MM:SS HANDOFF COMPLETE - Waiting for human review
```

## Exit Codes

- 0: Handoff successful
- 1: Push failed
- 2: PR creation failed
- 3: Status update failed
