---
name: verify-claim
description: Re-query a claimed issue to verify assignment succeeded (race condition check). Use immediately after claim-issue to prevent collisions.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Verify Claim Skill

## Purpose
Re-query a claimed issue to verify assignment succeeded (race condition check).

## Prerequisites
- Issue ID and assignee ID known
- `AGENT_ID` environment variable set

## Usage

```bash
# Verify claim after assignment attempt
/opencode/skill/verify-claim --issue-id I_kwDxxx --assignee-id U_xxx
```

## Implementation

```bash
# Query issue assignees
RESULT=$(gh api graphql -f query='
  query($issueId: ID!) {
    node(id: $issueId) {
      ... on Issue {
        assignees(first: 1) {
          nodes { login }
        }
      }
    }
  }' -f issueId="$ISSUE_ID" --jq '.data.node.assignees.nodes[0].login')

# Check if matches expected assignee
if [[ "$RESULT" == "$AGENT_ID" ]]; then
  echo "Claim verified successfully"
  exit 0
else
  echo "Claim failed - assigned to: $RESULT"
  exit 1
fi
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--issue-id` | Yes | Issue node ID (I_kwDxxx) |
| `--assignee-id` | Yes | Expected assignee (user ID or AGENT_ID) |

## Output

On success:
```
[AGENT-xxx] HH:MM:SS Verifying claim on issue #23...
[AGENT-xxx] HH:MM:SS Claim verified - assigned to AGENT-xxx
```

On failure:
```
[AGENT-xxx] HH:MM:SS Verifying claim on issue #23...
[AGENT-xxx] HH:MM:SS Claim FAILED - assigned to AGENT-yyy
```

## Exit Codes

- 0: Claim verified
- 1: Claim failed (another agent assigned)
- 2: Query error
