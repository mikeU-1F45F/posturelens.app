---
name: validate-ac
description: Check implementation against issue acceptance criteria and tick off completed items. Use before handoff to verify all requirements are met.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Validate Acceptance Criteria Skill

## Purpose
Check implementation against issue acceptance criteria and tick off completed items.

## Prerequisites
- Issue number known
- Issue contains acceptance criteria with checkboxes
- `AGENT_ID` environment variable set

## Usage

```bash
# Validate and update checkboxes
/opencode/skill/validate-ac --issue 23 \
  --verify "feature branch created" \
  --verify "comment added to main.ts" \
  --verify "commit message descriptive"
```

## Implementation

```bash
# Get issue body
ISSUE_BODY=$(gh issue view "$ISSUE_NUMBER" --json body --jq '.body')

# Parse checkboxes and verify
# For each --verify argument, tick off matching checkbox
# Update issue body with new checkbox state

# Check for unchecked items
UNCHECKED=$(echo "$ISSUE_BODY" | grep -c "^\- \[ \]")
if [[ $UNCHECKED -eq 0 ]]; then
  echo "All acceptance criteria met!"
  exit 0
else
  echo "$UNCHECKED items remaining"
  exit 1
fi
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--issue` | Yes | Issue number |
| `--verify` | No | Criterion to mark complete (can use multiple) |
| `--dry-run` | No | Preview changes without updating |

## Output

```
[AGENT-xxx] HH:MM:SS Validating acceptance criteria for issue #23...
[AGENT-xxx] HH:MM:SS Checking: "A feature branch is created for this issue"
[AGENT-xxx] HH:MM:SS   ✓ VERIFIED - Branch feature/issue-23-foo exists
[AGENT-xxx] HH:MM:SS Checking: "A single comment is added to the header of main.ts"
[AGENT-xxx] HH:MM:SS   ✓ VERIFIED - Comment found at line 3
[AGENT-xxx] HH:MM:SS Checking: "Changes are committed with a descriptive message"
[AGENT-xxx] HH:MM:SS   ✓ VERIFIED - Commit follows conventional style
[AGENT-xxx] HH:MM:SS 
[AGENT-xxx] HH:MM:SS 3/6 acceptance criteria met
[AGENT-xxx] HH:MM:SS Updated issue #23 with verified checkboxes
```

## Verification Methods

- **File existence**: Check if files exist at specified paths
- **Content search**: grep for specific strings in files
- **Git checks**: Verify branches, commits, PRs
- **Pattern matching**: Check commit message formats
- **Command success**: Run verification commands

## Exit Codes

- 0: All criteria met
- 1: Some criteria not met
- 2: Issue not found
