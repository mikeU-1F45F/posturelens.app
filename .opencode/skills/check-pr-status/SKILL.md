---
name: check-pr-status
description: Query PR status to determine if merged, has requested changes, or is still pending. Use for polling during refinement loops or checking if blocking PRs are merged.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Check PR Status Skill

## Purpose
Query PR status to determine if merged, has requested changes, or is still pending.

## Prerequisites
- PR number known
- GitHub CLI authenticated

## Usage

```bash
# Check PR #47 status
/opencode/skill/check-pr-status --pr 47

# Poll for changes (with retry)
/opencode/skill/check-pr-status --pr 47 --watch --interval 30
```

## Implementation

```bash
# Get PR details
PR_DATA=$(gh pr view "$PR_NUMBER" --json state,merged,reviewDecision,mergeStateStatus)

STATE=$(echo "$PR_DATA" | jq -r '.state')
MERGED=$(echo "$PR_DATA" | jq -r '.merged')
REVIEW=$(echo "$PR_DATA" | jq -r '.reviewDecision')
MERGEABLE=$(echo "$PR_DATA" | jq -r '.mergeStateStatus')

# Determine status
if [[ "$MERGED" == "true" ]]; then
  echo "STATUS=MERGED"
elif [[ "$REVIEW" == "CHANGES_REQUESTED" ]]; then
  echo "STATUS=CHANGES_REQUESTED"
elif [[ "$MERGEABLE" == "CLEAN" ]]; then
  echo "STATUS=MERGEABLE"
else
  echo "STATUS=PENDING"
fi
```

## Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--pr` | Yes | - | PR number |
| `--watch` | No | false | Poll until status changes |
| `--interval` | No | 60 | Seconds between polls |
| `--timeout` | No | 3600 | Max seconds to watch |

## Output

```
[AGENT-xxx] HH:MM:SS Checking status of PR #47...
[AGENT-xxx] HH:MM:SS State: OPEN
[AGENT-xxx] HH:MM:SS Review Decision: APPROVED
[AGENT-xxx] HH:MM:SS Merge Status: CLEAN
[AGENT-xxx] HH:MM:SS STATUS: MERGEABLE
```

Or if changes requested:
```
[AGENT-xxx] HH:MM:SS Checking status of PR #47...
[AGENT-xxx] HH:MM:SS State: OPEN
[AGENT-xxx] HH:MM:SS Review Decision: CHANGES_REQUESTED
[AGENT-xxx] HH:MM:SS STATUS: CHANGES_REQUESTED
[AGENT-xxx] HH:MM:SS Human has requested changes - ready to refine
```

## Exit Codes

- 0: MERGED or MERGEABLE
- 1: CHANGES_REQUESTED
- 2: CONFLICT or BLOCKED
- 3: PR not found
- 4: Watch timeout
