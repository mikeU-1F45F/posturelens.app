---
name: claim-issue
description: Query the GitHub Project board for available work in the "Selected" column, check for and validate all dependent issues are completed, assign the issue to the agent, and verify the claim succeeded. Use as the first step when starting work on a new issue.
metadata:
  author: posturelens-team
  version: "1.0"
---

# Claim Issue Skill

## Purpose
Query the GitHub Project board for available work in the "Selected" column, check for uncompleted dependent issues, assign the issue to the agent, and verify the claim succeeded.

**IMPORTANT**: Before claiming an issue, the skill must:
1. Read the issue body to check for prerequisites/dependent issues
2. Verify all dependent issues are completed (in "Done" column)
3. If dependencies are not met, alert the human and skip the issue
4. Only claim issues that are ready to work on

## Prerequisites
- GitHub CLI (`gh`) authenticated
- `AGENT_ID` environment variable set (e.g., `AGENT-20260214-120345`)
- Project ID known (stored in `.opencode/config.json` or passed as param)

## Usage

```bash
# Interactive mode
/opencode/skill/claim-issue

# With explicit project
/opencode/skill/claim-issue --project-id PVT_kwDOANN5s84ACbL0 --owner "@me" --project-number 3
```

## Output

On success:
```
[AGENT-20260214-120345] 14:32:01 Querying board for available work...
[AGENT-20260214-120345] 14:32:02 Found 3 items in "Selected" column
[AGENT-20260214-120345] 14:32:02 Attempting to claim issue #23...
[AGENT-20260214-120345] 14:32:03 Claim verified! Assigned to: AGENT-20260214-120345
[AGENT-20260214-120345] 14:32:03 Issue: "Add audio alert system"
[AGENT-20260214-120345] 14:32:03 Ready to create worktree for issue #23

ISSUE_NUMBER=23
ISSUE_TITLE="Add audio alert system"
ISSUE_ID=I_kwDOANN5s84ACbL1
PROJECT_ITEM_ID=PVTI_lADOANN5s84ACbL0zgBVd94
```

On failure (no available work):
```
[AGENT-20260214-120345] 14:32:01 Querying board for available work...
[AGENT-20260214-120345] 14:32:02 No unassigned items in "Selected" column
[AGENT-20260214-120345] 14:32:02 Hint: Ask human to triage Backlog → Selected

EXIT_CODE=1
```

On race condition (another agent claimed first):
```
[AGENT-20260214-120345] 14:32:01 Querying board for available work...
[AGENT-20260214-120345] 14:32:02 Found 3 items in "Selected" column
[AGENT-20260214-120345] 14:32:02 Attempting to claim issue #23...
[AGENT-20260214-120345] 14:32:03 Claim failed - already assigned to AGENT-20260214-120512
[AGENT-20260214-120345] 14:32:03 Retrying with next item after 1s delay...
[AGENT-20260214-120345] 14:32:04 Attempting to claim issue #24...
[AGENT-20260214-120345] 14:32:05 Claim verified! Assigned to: AGENT-20260214-120345

ISSUE_NUMBER=24
ISSUE_TITLE="Update alert thresholds"
ISSUE_ID=I_kwDOANN5s84ACbL2
PROJECT_ITEM_ID=PVTI_lADOANN5s84ACbL0zgBVd95
```

## Algorithm

1. **Query** - Get all items in project
2. **Filter** - Find items where:
   - Status field = "Selected"
   - No assignees (assignees.totalCount = 0)
3. **Sort** - By issue number (ascending) for deterministic ordering
4. **Check Dependencies** - For first candidate item:
   - Fetch full issue body using `gh issue view #{number}`
   - Parse for prerequisite/dependent issues (look for patterns like "Prerequisites", "Depends on", "Blockers", "DEPENDS:", checkboxes with issue references)
   - For each dependency found:
     - Check if issue exists in project
     - Verify it's in "Done" column
   - If ANY dependency is not completed:
     - Log: "Issue #{number} has uncompleted dependencies: #{dep1}, #{dep2}"
     - Skip this issue and try next candidate
5. **Attempt Claim** - For first item with all dependencies met:
   - Assign AGENT_ID to issue
   - Wait 500ms for propagation
6. **Verify** - Re-query the specific issue:
   - If assignee matches AGENT_ID → success
   - If assignee differs → race condition, retry with next item
   - If still unassigned → claim failed, retry
7. **Retry** - Up to 3 attempts with 1-second delays between

## Environment Variables

- `AGENT_ID` - Unique identifier for this agent instance
- `GITHUB_TOKEN` - (Optional) Override default gh auth

## Files

- `claim.sh` - Main implementation script
- `query.graphql` - GraphQL query for fetching items
- `assign.graphql` - GraphQL mutation for assigning issue

## Integration

After successful claim, agent should:
1. Create worktree: `git worktree add -b feature/issue-${ISSUE_NUMBER}-...`
2. Move to "In Progress": Update project board status
3. Start implementation

## Error Handling

| Error | Action | Exit Code |
|-------|--------|-----------|
| No items in Selected | Log, suggest human triage | 1 |
| All items assigned | Log, suggest waiting | 1 |
| All items have uncompleted dependencies | Log, suggest human review dependencies | 1 |
| Race condition (all retries fail) | Log collision, exit | 2 |
| GraphQL error | Log error details | 3 |
| Missing AGENT_ID | Log requirement | 4 |

## Dependency Checking

Before claiming an issue, the skill MUST verify all dependencies are complete:

### Dependency Patterns to Detect

Issues may list dependencies in various formats:

**Pattern 1: Prerequisites Section**
```markdown
## Prerequisites
- [x] Issue #5: Some completed work
- [ ] Issue #6: Some incomplete work
```

**Pattern 2: DEPENDS Marker**
```markdown
DEPENDS: #5, #6, #7
```

**Pattern 3: Blockers Section**
```markdown
## Blockers
- Issue #5 must be completed first
```

**Pattern 4: "Depends on" phrase**
```markdown
This work depends on #5 being completed.
```

### Dependency Validation

For each dependency found:
1. Extract issue number from reference (e.g., "#5" → 5)
2. Check if issue exists in the project
3. Check if issue status is "Done"
4. If issue is in any other column (Selected, In Progress, Backlog, In Review), it's NOT ready

### Action on Uncompleted Dependencies

If an issue has uncompleted dependencies:
```
[AGENT-20260214-120345] 14:32:02 Issue #10 has uncompleted dependencies:
[AGENT-20260214-120345] 14:32:02   - #5 (status: Backlog)
[AGENT-20260214-120345] 14:32:02   - #6 (status: Backlog)
[AGENT-20260214-120345] 14:32:02 Skipping #10, trying next item...
```

Continue to next unassigned item in Selected column.

## Race Condition Mitigation

The skill implements optimistic locking:
- 500ms delay after assignment before verification
- Up to 3 retry attempts
- 1-second delay between retries
- Deterministic ordering (by issue number) reduces collisions

## Testing

Test scenarios:
1. Empty Selected column → should exit 1
2. Single unassigned item with no dependencies → should claim successfully
3. Single unassigned item with completed dependencies → should claim successfully
4. Single unassigned item with uncompleted dependencies → should skip and try next
5. Multiple unassigned items where first has dependencies → should skip to first item with all dependencies met
6. Simultaneous agents → should handle via retries
7. Already assigned item → should skip and try next
8. All items in Selected have uncompleted dependencies → should exit 1 with dependency message

### Example Dependency Test Case

Issue #10 has body:
```markdown
## Prerequisites
- [x] Issue #5 (completed)
- [ ] Issue #6 (in Backlog)
```

Expected behavior:
- Detect issues #5 and #6 as dependencies
- Check #5 status → "Done" ✓
- Check #6 status → "Backlog" ✗
- Log dependency warning
- Skip #10, try next item
