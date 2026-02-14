---
name: check-dependencies
description: Verify that blocking issues are completed before starting work on dependent issues. Use before claiming an issue that has DEPENDS markers or when working on multi-issue epics.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Check Dependencies Skill

## Purpose
Verify that blocking issues are completed before starting work on dependent issues.

## Prerequisites
- Issue number known
- Issue contains dependency markers (BLOCKS/DEPENDS)
- GitHub CLI authenticated

## Usage

```bash
# Check if dependencies are met for issue #45
/opencode/skill/check-dependencies --issue 45

# Check with verbose output
/opencode/skill/check-dependencies --issue 45 --verbose
```

## Implementation

```bash
# Get issue body and parse dependency markers
ISSUE_BODY=$(gh issue view "$ISSUE_NUMBER" --json body --jq '.body')

# Look for "DEPENDS #XX" or "BLOCKS #XX" patterns
DEPENDENCIES=$(echo "$ISSUE_BODY" | grep -oE "DEPENDS #[0-9]+" | grep -oE "[0-9]+")
BLOCKERS=$(echo "$ISSUE_BODY" | grep -oE "BLOCKS #[0-9]+" | grep -oE "[0-9]+")

# Check status of each dependency
for dep in $DEPENDENCIES; do
  DEP_STATUS=$(gh issue view "$dep" --json state --jq '.state')
  if [[ "$DEP_STATUS" != "CLOSED" ]]; then
    echo "BLOCKED: Issue #$dep not completed (status: $DEP_STATUS)"
    EXIT_CODE=1
  fi
done

# For blockers (issues this one blocks), ensure they exist
for blocker in $BLOCKERS; do
  BLOCKER_STATUS=$(gh issue view "$blocker" --json state --jq '.state' 2>/dev/null || echo "NOT_FOUND")
  if [[ "$BLOCKER_STATUS" == "NOT_FOUND" ]]; then
    echo "WARNING: Blocked issue #$blocker not found"
  fi
done
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--issue` | Yes | Issue number to check |
| `--verbose` | No | Show detailed status of all dependencies |
| `--wait` | No | Poll until dependencies are resolved |

## Dependency Markers

Issues should use these markers in body:
```markdown
Issue #42: Epic - Alert System
  ├── Sub-issue #43: Create alert engine core (BLOCKS #44, #45)
  ├── Sub-issue #44: Add visual alerts (DEPENDS #43)
  └── Sub-issue #45: Audio alerts (DEPENDS #43)
```

## Output

All dependencies met:
```
[AGENT-xxx] HH:MM:SS Checking dependencies for issue #45...
[AGENT-xxx] HH:MM:SS Dependency #43: CLOSED ✓
[AGENT-xxx] HH:MM:SS All dependencies met - ready to proceed
```

Dependencies not met:
```
[AGENT-xxx] HH:MM:SS Checking dependencies for issue #45...
[AGENT-xxx] HH:MM:SS Dependency #43: OPEN ✗
[AGENT-xxx] HH:MM:SS BLOCKED: Cannot start issue #45 until #43 is closed
[AGENT-xxx] HH:MM:SS Hint: Work on blocking issue #43 first
```

## Exit Codes

- 0: All dependencies met
- 1: Dependencies not met
- 2: Issue not found
- 3: Cannot parse dependencies
